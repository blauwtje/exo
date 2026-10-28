import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADHD_RUNS, Spend, buildBaseline, buildLabelRows, calibrateLines, checkBaseline, callStats, caseLine, claudeReply, makeStylePlugin, parseArgs, projectDryRun, readCases, readSaturated, runAddFailLabels, rescoreCases, runRescore, runScore, runToLabel, scoreCases, selectCases, stabilityItems, visibleTokens } from '../benchmarks/adhd-score.mjs';
import { buildFailRows, dropFact } from '../benchmarks/adhd/labels.mjs';
import { BREVITY_LINES, withoutSentence } from '../benchmarks/tasks.mjs';

const cases = [
  { id: 'a', context: 'C', question: 'Q', facts: ['f'], literals: [['KEY']], lead: [] },
  { id: 'b', context: 'C', question: 'Q', facts: ['f'], literals: [], lead: [] },
];
const spendOf = (maxUsd) => ({ maxUsd, total: 0, add(c) { this.total += c; if (this.total > maxUsd) throw new Error('passed --max-usd'); } });
const verdictLines = (input, failing = []) => [...input.matchAll(/^Fact (\d+):/gm)].map((m) => `${m[1]}: ${failing.includes(Number(m[1])) ? 'FAIL' : 'PASS'}`).join('\n');
const pass = async ({ input }) => verdictLines(input);
const passCost = (cost) => async (call) => ({ text: await pass(call), cost });
// why: a reply of n visible tokens that holds the literal KEY, so gates pass; billed `tokens` in these tests is deliberately unrelated.
const sized = (n) => `KEY${' w'.repeat(n - 1)}`;
const withReplies = (n) => ({ replies: [sized(n)], mean: 5000 });
const baseline = { a: withReplies(100), b: withReplies(200) };

test('score is the mean per-case token ratio against the baseline', async () => {
  const reply = async ({ prompt }) => ({ text: sized(50), tokens: 5000, cost: 0.01, prompt });
  const out = await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(1), runs: 1 });
  assert.equal(out.score, (0.5 + 0.25) / 2);
  assert.equal(out.runs, 1);
});

test('ratio uses visible reply length and the baseline replies, not billed tokens', async () => {
  const reply = async () => ({ text: sized(10), tokens: 999, cost: 0 });
  const out = await scoreCases({ cases: [cases[0]], baseline: { a: { replies: [sized(40), sized(60)], tokens: [1, 1], mean: 1 } }, reply, judge: pass, spend: spendOf(1), runs: 1 });
  assert.equal(out.score, 0.2);
  assert.equal(out.perCase[0].runs[0].visible, 10);
  assert.equal(out.perCase[0].runs[0].tokens, 999);
  assert.equal(out.perCase[0].visibleTokens, 10);
  assert.equal(out.perCase[0].tokens, 999);
  assert.equal(out.billedTokens, 999);
  assert.equal(out.baselineBilledTokens, 1);
  assert.equal(out.perCase[0].baselineVisible, 50);
});

test('visibleTokens counts words, numbers and punctuation marks, not whitespace', () => {
  assert.equal(visibleTokens('Dat kan, maar 3 keer.'), 7);
  assert.equal(visibleTokens(''), 0);
});

test('a failed gate scores the case 1.0', async () => {
  const reply = async () => ({ text: 'no literal.', tokens: 10, cost: 0 });
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge: pass, spend: spendOf(1) });
  assert.equal(out.score, 1);
  assert.deepEqual(out.perCase[0].failed, ['literals']);
});

test('a failed judge scores the case 1.0', async () => {
  const reply = async () => ({ text: 'KEY here.', tokens: 10, cost: 0 });
  const judge = async () => '1: FAIL';
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge, spend: spendOf(1) });
  assert.equal(out.score, 1);
  assert.deepEqual(out.perCase[0].failed, ['judge:facts']);
});

test('one failing run of three scores the mean of per-run ratios, not 1', async () => {
  let n = 0;
  const reply = async () => ({ text: (n += 1) === 2 ? 'no literal.' : sized(50), tokens: 7, cost: 0 });
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge: pass, spend: spendOf(1), runs: 3 });
  assert.ok(Math.abs(out.score - (0.5 + 1 + 0.5) / 3) < 1e-9);
  assert.deepEqual(out.perCase[0].failed, ['literals']);
  assert.deepEqual(out.perCase[0].runs.map((r) => r.ratio), [0.5, 1, 0.5]);
});

test('cases run concurrently, at most 8 in flight, and perCase keeps case order', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, context: 'C', question: 'Q', facts: ['f'], literals: [], lead: [] }));
  const base = Object.fromEntries(many.map((c) => [c.id, withReplies(100)]));
  let inFlight = 0;
  let peak = 0;
  const reply = async () => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    return { text: 'ok.', tokens: 50, cost: 0 };
  };
  const out = await scoreCases({ cases: many, baseline: base, reply, judge: pass, spend: spendOf(1), runs: 1 });
  assert.equal(peak, 8);
  assert.deepEqual(out.perCase.map((p) => p.id), many.map((c) => c.id));
});

test('adhd arm runs 3 per case by default and --runs overrides', async () => {
  let calls = 0;
  const reply = async () => { calls += 1; return { text: 'KEY.', tokens: 10, cost: 0.3 }; };
  const out = await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(10) });
  assert.equal(out.runs, 3);
  assert.equal(calls, 6);
  calls = 0;
  await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(10), runs: 1 });
  assert.equal(calls, 2);
});

test('judge spend counts toward the cap', async () => {
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: 0 });
  const judge = passCost(0.1);
  const spend = spendOf(1);
  await scoreCases({ cases: [cases[0]], baseline, reply, judge, spend, runs: 1 });
  assert.ok(Math.abs(spend.total - 3 * 0.1) < 1e-9);
  await assert.rejects(scoreCases({ cases: [cases[0]], baseline, reply, judge, spend: spendOf(0.2), runs: 1 }), /max-usd/);
});

test('checkBaseline accepts a full baseline and names each defect', () => {
  const good = { a: { tokens: [1, 2, 3], replies: ['x', 'y', 'z'], mean: 2 }, b: { tokens: [3, 3, 3], replies: ['x', 'y', 'z'], mean: 3 } };
  assert.deepEqual(checkBaseline({ cases, baseline: good }), []);
  const bad = { a: { tokens: [1, 2], replies: ['x', 'y', 'z'], mean: 9 } };
  const problems = checkBaseline({ cases, baseline: bad }).join('\n');
  assert.match(problems, /a: needs 3 token counts/);
  assert.match(problems, /a: mean 9/);
  assert.match(problems, /b: missing/);
});

test('spend past the cap stops the run', async () => {
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: 1 });
  await assert.rejects(scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(1) }), /max-usd/);
});

test('buildBaseline stores replies, tokens and the mean per case', async () => {
  let n = 0;
  const reply = async () => ({ text: 'r', tokens: (n += 10), cost: 0 });
  const out = await buildBaseline({ cases: [cases[0]], reply, spend: spendOf(1), runs: 2 });
  assert.deepEqual(out.a.tokens, [10, 20]);
  assert.equal(out.a.mean, 15);
});

test('a case missing from the baseline is an error', async () => {
  await assert.rejects(scoreCases({ cases, baseline: {}, reply: async () => ({}), judge: pass, spend: spendOf(1) }), /baseline lacks/);
});

test('buildLabelRows writes 5 null-label facts rows mixing default and adhd replies', () => {
  const base = { a: { replies: ['d1', 'd2', 'd3'] }, b: { replies: ['d4', 'd5', 'd6'] } };
  const rows = buildLabelRows({ cases, baseline: base, adhdReplies: { a: ['x1', 'x2'], b: ['x3', 'x4'] } });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.dimension === 'facts'));
  assert.ok(rows.some((r) => r.id.includes('-default-')) && rows.some((r) => r.id.includes('-adhd-')));
  assert.deepEqual(Object.keys(rows[0]), ['id', 'dimension', 'question', 'facts', 'reply', 'label']);
  assert.ok(rows.every((r) => r.label === null));
});

test('buildLabelRows errors when too few replies are stored', () => {
  assert.throws(() => buildLabelRows({ cases, baseline: { a: { replies: ['d'] } } }), /need 5/);
});

test('calibrateLines prints facts agreement and skips rows of dropped judges', async () => {
  const labels = ['facts', 'first-line', 'scannable'].flatMap((dimension) =>
    ['PASS', 'FAIL'].map((label, i) => ({ id: `${dimension}${i}`, dimension, question: 'Q', facts: ['f'], reply: 'r', label })));
  const lines = await calibrateLines({ labels, judge: pass });
  assert.deepEqual(lines, ['facts 1/2 pass_rows=1/1 fail_rows=0/1 built_fail_rows=0/0 deleted_fact_only=0/0']);
});

test('first call per arm runs alone, the rest run in parallel', async () => {
  let active = 0;
  const seen = [];
  const reply = async () => { active += 1; seen.push(active); await new Promise((r) => setTimeout(r, 5)); active -= 1; return { text: 'KEY.', tokens: 10, cost: 0 }; };
  await scoreCases({ cases: [cases[0]], baseline, reply, judge: pass, spend: spendOf(1), runs: 3 });
  assert.equal(seen[0], 1);
  assert.equal(seen[1], 1);
  assert.equal(seen[2], 2);
});

test('Spend splits reply and judge cost and prints both', () => {
  const spend = new Spend(1);
  spend.add(0.25);
  spend.add(0.1, 'judge');
  assert.equal(spend.line(), 'cost_usd=0.3500 reply_cost_usd=0.2500 judge_cost_usd=0.1000\n');
  assert.throws(() => spend.add(1, 'judge'), /max-usd/);
});

test('judge cost is recorded as judge spend', async () => {
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: 0.01 });
  const spend = new Spend(5);
  await scoreCases({ cases: [cases[0]], baseline, reply, judge: passCost(0.1), spend, runs: 2 });
  // why: each passing reply gets its own 3 votes, so 2 runs make 6 judge calls.
  assert.ok(Math.abs(spend.reply - 0.02) < 1e-9 && Math.abs(spend.judge - 0.6) < 1e-9);
});

test('projection is checked as each case completes, so an early costly finisher stops the run', async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, context: `c${i}`, question: 'Q', facts: ['f'], literals: [], lead: [] }));
  const base = Object.fromEntries(many.map((c) => [c.id, withReplies(100)]));
  // why: the eighth case is costly but replies first, a sequential loop reaches it after seven cheap ones; only a check at completion time sees it.
  const reply = async ({ prompt }) => {
    const costly = prompt.startsWith('c7');
    if (!costly) await new Promise((r) => setTimeout(r, 20));
    return { text: 'ok.', tokens: 10, cost: costly ? 0.2 : 0.01 };
  };
  await assert.rejects(scoreCases({ cases: many, baseline: base, reply, judge: pass, spend: spendOf(1) }), /projected_usd/);
});

const waitForStarts = async (file, count) => {
  const deadline = Date.now() + 30000;
  const started = () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0);
  while (started() < count) {
    if (Date.now() > deadline) throw new Error(`fake claude start ${count} never seen`);
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('a hung claude call is killed at the cap and retried once, then fails clearly', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  const starts = path.join(dir, 'starts');
  const hangs = path.join(dir, 'hangs');
  const ok = '{"result":"x","usage":{"output_tokens":1},"total_cost_usd":0}';
  const hang = `echo hung >> ${starts}; exec sleep 30`;
  const fake = (body) => fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat >/dev/null\n${body}\n`, { mode: 0o755 });
  fake(`if [ ! -e ${hangs} ]; then touch ${hangs}; ${hang}; fi\necho '${ok}'`);
  const savedPath = process.env.PATH;
  process.env.PATH = `${dir}:${savedPath}`;
  process.env.EXO_ADHD_CALL_MS = '300';
  callStats.timeouts = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const first = claudeReply({ arm: 'default', prompt: 'q' });
    await waitForStarts(starts, 1);
    t.mock.timers.tick(300);
    const out = await first;
    assert.equal(out.text, 'x');
    assert.equal(callStats.timeouts, 1);
    fs.rmSync(starts);
    fake(hang);
    const second = claudeReply({ arm: 'default', prompt: 'q' });
    const failure = assert.rejects(second, /timed out twice/);
    await waitForStarts(starts, 1);
    t.mock.timers.tick(300);
    await waitForStarts(starts, 2);
    t.mock.timers.tick(300);
    await failure;
    assert.equal(callStats.timeouts, 3);
  } finally {
    t.mock.timers.reset();
    process.env.PATH = savedPath;
    delete process.env.EXO_ADHD_CALL_MS;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projection ignores the cost of cases still in flight', async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, context: 'C', question: 'Q', facts: ['f'], literals: [], lead: [] }));
  const base = Object.fromEntries(many.map((c) => [c.id, withReplies(100)]));
  const reply = async () => ({ text: 'ok.', tokens: 10, cost: 0.05 });
  const out = await scoreCases({ cases: many, baseline: base, reply, judge: pass, spend: spendOf(1), runs: 1 });
  assert.equal(out.perCase.length, 10);
});

test('a claude reply with no total_cost_usd is an error, not $0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\ncat >/dev/null\necho \'{"result":"x","usage":{"output_tokens":1}}\'\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    await assert.rejects(claudeReply({ arm: 'default', prompt: 'q' }), /total_cost_usd/);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a gate-failed run is not judged; the passing run still is', async () => {
  let judged = 0;
  let k = 0;
  const reply = async () => ({ text: k++ === 0 ? '# Title' : 'Plain', tokens: 1, cost: 0 });
  const judge = async (call) => { judged += 1; return pass(call); };
  const out = await scoreCases({ cases: [{ ...cases[1], id: 'a' }], baseline, reply, judge, spend: spendOf(9), runs: 2 });
  assert.equal(judged, 3);
  assert.ok(Math.abs(out.score - (1 + 0.01) / 2) < 1e-9);
});

test('buildBaseline records the cost of each case', async () => {
  const out = await buildBaseline({ cases: [cases[0]], reply: async () => ({ text: 't', tokens: 1, cost: 0.5 }), spend: spendOf(4), runs: 2 });
  assert.equal(out.a.cost, 1);
});

test('runToLabel keeps rows the user already labelled', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-labels-')), 'labels.jsonl');
  const labelled = `${JSON.stringify({ id: 'x', dimension: 'facts', label: 'PASS' })}\n`;
  fs.writeFileSync(file, labelled);
  const base = { a: { replies: ['d1', 'd2', 'd3'] }, b: { replies: ['d4', 'd5', 'd6'] } };
  assert.throws(() => runToLabel(cases, { file, baseline: base }), /already labelled/);
  assert.equal(fs.readFileSync(file, 'utf8'), labelled);
  fs.writeFileSync(file, `${JSON.stringify({ id: 'x', dimension: 'facts', label: null })}\n`);
  runToLabel(cases, { file, baseline: base });
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 5);
});

const lidCase = { id: 'lid', question: 'will it keep running with the lid open?', facts: ['yes, with the lid open it keeps running', 'caffeinate -di keeps the Mac from sleeping'], literals: [], lead: [] };

test('dropFact deletes every part carrying one fact and records what it removed', () => {
  const out = dropFact('**Yes, it stays awake all night; `caffeinate -di` stops the Mac from sleeping.**', lidCase.facts);
  assert.equal(out.reply, '**Yes, it stays awake all night.**');
  assert.equal(out.factIndex, 1);
  assert.deepEqual(out.removed, ['`caffeinate -di` stops the Mac from sleeping.']);
});

test('dropFact refuses a cut that leaves a fact word or the same answer word behind', () => {
  assert.equal(dropFact('Caffeinate keeps the Mac awake; caffeinate stops sleeping.', ['caffeinate keeps the Mac from sleeping']), null);
  assert.equal(dropFact('No: Python adds install risk; stay with Node.', ['no, stay with Node']), null);
  assert.equal(dropFact('One sentence only.', ['one sentence only']), null);
});

test('buildFailRows labels FAIL by construction from human PASS rows and judged log replies only', () => {
  const passRows = [
    { id: 'h#0', dimension: 'facts', question: lidCase.question, facts: lidCase.facts, reply: 'Yes, it stays awake all night. caffeinate -di stops the Mac from sleeping.', label: 'PASS' },
    { id: 'h#0', dimension: 'scannable', question: lidCase.question, facts: lidCase.facts, reply: 'x y z', label: 'PASS' },
  ];
  const reply = 'Yes, it stays awake all night; caffeinate -di stops the Mac from sleeping.';
  const log = { perCase: [
    { id: 'lid', replies: [reply], failed: ['judge:scannable'] },
    { id: 'lid', replies: ['Lid open; caffeinate -di keeps the Mac from sleeping, it runs.'], runs: [{ failed: ['judge:facts'] }] },
    { id: 'lid', replies: ['Lid open, it keeps running; caffeinate -di keeps the Mac from sleeping.'], runs: [{ failed: ['literals'] }] },
  ] };
  const rows = buildFailRows({ passRows, logs: [{ name: 'L.json', log }], cases: [lidCase] }).filter((r) => r.dimension === 'facts');
  assert.deepEqual(rows.map((r) => r.id), ['h#0~drop-fact1', 'L.json:lid:0~drop-fact1']);
  assert.ok(rows.every((r) => r.label === 'FAIL' && r.dimension === 'facts' && r.built.by === 'drop-fact'));
  assert.deepEqual(rows.map((r) => r.built.arm), ['default', 'adhd']);
  assert.equal(rows[1].built.source, 'L.json:lid:0');
  assert.equal(rows[1].built.fact, lidCase.facts[1]);
  assert.equal(rows[1].reply, 'Yes, it stays awake all night.');
});

test('runAddFailLabels appends new rows once and leaves existing lines untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-labels-'));
  const file = path.join(dir, 'labels.jsonl');
  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir);
  const human = `${JSON.stringify({ id: 'h#0', dimension: 'facts', question: lidCase.question, facts: lidCase.facts, reply: 'Yes, it stays awake all night. caffeinate -di stops the Mac from sleeping.', label: 'PASS' })}\n`;
  fs.writeFileSync(file, human);
  fs.writeFileSync(path.join(logDir, 'a.json'), JSON.stringify({ perCase: [{ id: 'lid', replies: ['Yes, it stays awake all night; caffeinate -di stops the Mac from sleeping!'], failed: [] }] }));
  assert.equal(runAddFailLabels([lidCase], { file, logDir, baseline: {} }).length, 2);
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(human));
  assert.equal(runAddFailLabels([lidCase], { file, logDir, baseline: {} }).length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
});

test('stabilityItems keeps only the replies that pass their gates, one item per reply', () => {
  const log = { perCase: [{ id: 'a', replies: ['none', 'KEY here.', 'KEY too.'] }, { id: 'b', replies: ['x'] }, { id: 'gone', replies: ['y'] }] };
  assert.deepEqual(stabilityItems(cases, log), [
    { id: 'a#1', question: 'Q', facts: ['f'], reply: 'KEY here.' },
    { id: 'a#2', question: 'Q', facts: ['f'], reply: 'KEY too.' },
    { id: 'b#0', question: 'Q', facts: ['f'], reply: 'x' },
  ]);
});

test('buildFailRows adds one baseline facts row per case and no rows for dropped judges', () => {
  const passRows = [{ id: 'h#0', dimension: 'first-line', question: lidCase.question, facts: lidCase.facts, reply: 'Yes, it runs.', label: 'PASS' }];
  const log = { perCase: [{ id: 'lid', replies: ['Yes, it runs on.'], failed: ['judge:facts'] }] };
  const baseline = { lid: { replies: ['Yes, it stays awake all night. caffeinate -di stops the Mac from sleeping.', 'Yes, it stays up all night. caffeinate -di stops the Mac from sleeping.'] } };
  const rows = buildFailRows({ passRows, logs: [{ name: 'L.json', log }, { name: 'M.json', log }], cases: [lidCase], baseline });
  assert.deepEqual(rows.map((r) => [r.dimension, r.id, r.built.arm, r.built.source]), [['facts', 'baseline:lid:0~drop-fact1', 'default', 'baseline:lid:0']]);
});

const fourFacts = { id: 'a', context: 'C', question: 'Q', facts: ['f1', 'f2', 'f3', 'f4'], literals: [['KEY']], lead: [] };

test('a run passing its gates but missing m of n facts scores r + (1 - r) * m / n and logs the missing facts', async () => {
  const reply = async () => ({ text: sized(20), tokens: 1, cost: 0 });
  const judge = async ({ input }) => verdictLines(input, [2, 4]);
  const out = await scoreCases({ cases: [fourFacts], baseline, reply, judge, spend: spendOf(1) });
  const r = 0.2;
  assert.ok(Math.abs(out.score - (r + (1 - r) * 2 / 4)) < 1e-9, `score ${out.score}`);
  assert.deepEqual(out.perCase[0].failed, ['judge:facts']);
  assert.deepEqual(out.perCase[0].runs[0].missingFacts, ['f2', 'f4']);
  assert.equal(out.passRate, 0);
});

test('each passing reply is judged alone, so a sibling reply cannot change its verdict', async () => {
  let k = 0;
  const reply = async () => ({ text: k++ === 0 ? `${sized(20)} good` : `${sized(20)} bad`, tokens: 1, cost: 0 });
  const inputs = [];
  const judge = async ({ input }) => { inputs.push(input); return verdictLines(input, input.includes('bad') ? [1] : []); };
  const out = await scoreCases({ cases: [fourFacts], baseline, reply, judge, spend: spendOf(1), runs: 2 });
  assert.ok(inputs.every((input) => (input.match(/^Reply:/gm) ?? []).length === 1 && !(input.includes('good') && input.includes('bad'))));
  assert.deepEqual(out.perCase[0].runs.map((run) => run.missing), [[], [0]]);
});

test('a failing run scores max(1, r), so it never beats a complete run when r > 1', async () => {
  const long = { ...cases[0], facts: ['f1', 'f2'] };
  const gateFail = async () => ({ text: `no${' w'.repeat(149)}`, tokens: 1, cost: 0 });
  const failGate = await scoreCases({ cases: [long], baseline, reply: gateFail, judge: pass, spend: spendOf(1) });
  assert.ok(Math.abs(failGate.score - 1.5) < 1e-9, `gate fail ${failGate.score}`);
  const longReply = async () => ({ text: sized(150), tokens: 1, cost: 0 });
  const missOne = await scoreCases({ cases: [long], baseline, reply: longReply, judge: async ({ input }) => verdictLines(input, [1]), spend: spendOf(1) });
  const complete = await scoreCases({ cases: [long], baseline, reply: longReply, judge: pass, spend: spendOf(1) });
  assert.ok(missOne.score >= complete.score - 1e-9 && Math.abs(complete.score - 1.5) < 1e-9);
});

test('caseLine writes id, ratio, visible and billed tokens, failed gates and missing fact numbers per run', () => {
  const p = { id: 'a', ratio: 0.5, visibleTokens: 12, baselineVisible: 50, tokens: 300, baselineTokens: 400, failed: [], runs: [{ missing: [] }, { missing: [0, 2] }] };
  assert.equal(caseLine(p), 'a ratio=0.500 visible=12/50 billed=300/400 failed=none missing=run2:1,3\n');
  assert.equal(caseLine({ ...p, failed: ['lead'], runs: [{ missing: [] }] }), 'a ratio=0.500 visible=12/50 billed=300/400 failed=lead\n');
});

test('caseLine rounds the baseline means like the adhd side', () => {
  const p = { id: 'a', ratio: 0.5, visibleTokens: 40 / 3, baselineVisible: 400 / 3, tokens: 1000 / 3, baselineTokens: 1238 / 3, failed: [], runs: [] };
  assert.equal(caseLine(p), 'a ratio=0.500 visible=13/133 billed=333/413 failed=none\n');
});

test('buildBaseline keeps existing rows and replies only for missing cases', async () => {
  const seen = [];
  const reply = async ({ prompt }) => { seen.push(prompt); return { text: 'new', tokens: 5, cost: 0 }; };
  const existing = { a: { replies: ['old'], tokens: [1], mean: 1, cost: 0 } };
  const out = await buildBaseline({ cases, reply, spend: spendOf(1), runs: 1, existing });
  assert.deepEqual(out.a.replies, ['old']);
  assert.deepEqual(out[cases[1].id].replies, ['new']);
  assert.equal(seen.length, cases.length - 1);
});

test('buildBaseline with all rebuilds every case', async () => {
  const existing = { a: { replies: ['old'], tokens: [1], mean: 1, cost: 0 } };
  const out = await buildBaseline({ cases, reply: async () => ({ text: 'new', tokens: 5, cost: 0 }), spend: spendOf(1), runs: 1, existing, all: true });
  assert.deepEqual(out.a.replies, ['new']);
});

test('buildBaseline saves after each case and a failure names the case and arm', async () => {
  const saves = [];
  let n = 0;
  const reply = async () => { if ((n += 1) === 2) throw new Error('timed out'); return { text: 'r', tokens: 1, cost: 0 }; };
  await assert.rejects(
    buildBaseline({ cases, reply, spend: spendOf(1), runs: 1, save: (rows) => saves.push(Object.keys(rows)) }),
    (error) => error.message.includes(cases[1].id) && error.message.includes('arm default') && error.message.includes('timed out'),
  );
  assert.deepEqual(saves, [[cases[0].id]]);
});

const STYLE_FILE = fs.readFileSync(new URL('../output-styles/adhd.md', import.meta.url), 'utf8');
const pluginStyle = (ablate) => {
  const dir = makeStylePlugin(ablate);
  try {
    return fs.readFileSync(path.join(dir, 'output-styles', 'adhd.md'), 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('the style plugin without --ablate carries the full style file', () => {
  assert.equal(pluginStyle(null), STYLE_FILE);
});

test('the style plugin with an ablated slug lacks exactly that sentence', () => {
  for (const [slug, sentence] of Object.entries(BREVITY_LINES)) {
    const style = pluginStyle(slug);
    assert.equal(style.includes(sentence), false, `${slug} drops its sentence`);
    assert.equal(style, withoutSentence(STYLE_FILE, sentence));
    assert.equal(style.length < STYLE_FILE.length, true);
    assert.equal(style.startsWith('---\n'), true);
  }
});

test('the score log records the ablated slug, null without the flag', async () => {
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0.01 });
  const logged = async (flags) => {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
    try {
      const opts = { ...parseArgs([...flags, '--runs', '1']), logDir };
      await runScore({ opts, cases, reply, judge: pass, spend: spendOf(1), baseline });
      return JSON.parse(fs.readFileSync(path.join(logDir, fs.readdirSync(logDir)[0]), 'utf8'));
    } finally {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
  };
  assert.equal((await logged(['--ablate', 'no-why'])).ablate, 'no-why');
  assert.equal((await logged([])).ablate, null);
});

test('each case row holds its own reply and judge cost', async () => {
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: 0.01 });
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge: passCost(0.1), spend: spendOf(5), runs: 2 });
  assert.ok(Math.abs(out.perCase[0].cost_usd - 0.62) < 1e-9);
});

test('the score log records the wall time of the run in milliseconds', async () => {
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0.01 });
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  try {
    await runScore({ opts: { ...parseArgs(['--runs', '1']), logDir }, cases, reply, judge: pass, spend: spendOf(1), baseline });
    const log = JSON.parse(fs.readFileSync(path.join(logDir, fs.readdirSync(logDir)[0]), 'utf8'));
    assert.equal(Number.isFinite(log.durationMs) && log.durationMs >= 0, true);
    assert.equal(log.perCase.every((p) => typeof p.cost_usd === 'number'), true);
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});

test('dry run prices the cells from the cached baseline cost per case, with zero calls', () => {
  const priced = { a: { ...withReplies(100), replies: ['x', 'y', 'z'], cost: 0.3 }, b: { ...withReplies(100), replies: ['x', 'y', 'z'], cost: 0.6 } };
  const out = projectDryRun({ cases, baseline: priced, runs: 2 });
  assert.equal(out.cells, 4);
  assert.ok(Math.abs(out.projectedUsd - 0.6 * 1.4) < 1e-9);
  assert.throws(() => projectDryRun({ cases, baseline: { a: priced.a }, runs: 2 }), /baseline lacks cases: b/);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs([]).dryRun, false);
});

test('--screen drops the saturated ids and defaults to 1 run, an explicit --runs wins', () => {
  assert.equal(parseArgs(['--screen']).runs, 1);
  assert.equal(parseArgs(['--screen', '--runs', '2']).runs, 2);
  assert.equal(parseArgs([]).runs, ADHD_RUNS);
  assert.deepEqual(selectCases(cases, parseArgs(['--screen']), ['a']).map((c) => c.id), ['b']);
});

test('--cases keeps only the named ids, intersects with --screen and rejects an unknown id', () => {
  const ids = (flags, saturated) => selectCases(cases, parseArgs(flags), saturated).map((c) => c.id);
  assert.deepEqual(ids(['--cases', 'b']), ['b']);
  assert.deepEqual(ids(['--cases', 'a,b', '--screen'], ['a']), ['b']);
  assert.throws(() => ids(['--cases', 'a,zzz']), /unknown case: zzz/);
});

test('the saturated list holds 4 ids that all exist in the cases file', () => {
  const all = readCases().map((c) => c.id);
  const saturated = readSaturated();
  assert.equal(saturated.length, 4);
  assert.equal(saturated.every((id) => all.includes(id)), true);
  assert.equal(selectCases(readCases(), { screen: true, caseIds: null }).length, all.length - 4);
});

test('the score log records screen and the scored case ids', async () => {
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0.01 });
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  try {
    await runScore({ opts: { ...parseArgs(['--screen']), logDir }, cases, reply, judge: pass, spend: spendOf(1), baseline });
    const log = JSON.parse(fs.readFileSync(path.join(logDir, fs.readdirSync(logDir)[0]), 'utf8'));
    assert.equal(log.screen, true);
    assert.deepEqual(log.cases, ['a', 'b']);
    assert.equal(log.runs, 1);
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});

const storedLog = (perCase) => ({ runs: 2, screen: true, ablate: null, perCase });
const storedRow = (id, replies) => ({ id, replies, tokens: 77, baselineTokens: 5000, ratio: 1, failed: [], runs: [] });

test('rescoreCases judges the stored replies again, keeps old tokens and bills only the judge', async () => {
  const log = storedLog([storedRow('a', [sized(50), 'no literal.']), storedRow('b', [sized(100)])]);
  const spend = new Spend(5);
  const out = await rescoreCases({ cases, baseline, log, judge: passCost(0.1), spend });
  assert.equal(out.perCase.length, 2);
  assert.deepEqual(out.perCase[0].failed, ['literals']);
  assert.equal(out.perCase[0].runs[0].ratio, 0.5);
  assert.equal(out.perCase[0].runs[1].ratio, 1);
  assert.equal(out.perCase[0].tokens, 77);
  assert.equal(out.perCase[0].baselineTokens, 5000);
  assert.ok(Math.abs(out.perCase[0].cost_usd - 0.3) < 1e-9);
  assert.equal(spend.reply, 0);
  assert.ok(Math.abs(spend.judge - 0.6) < 1e-9);
  assert.equal(out.runs, 2);
});

test('rescoreCases rejects a log with no replies for the selected cases', async () => {
  const noReplies = storedLog([{ id: 'a', tokens: 1, baselineTokens: 1 }]);
  await assert.rejects(rescoreCases({ cases, baseline, log: noReplies, judge: pass, spend: spendOf(1) }), /no replies to rescore/);
  await assert.rejects(rescoreCases({ cases: [cases[1]], baseline, log: storedLog([storedRow('a', ['x'])]), judge: pass, spend: spendOf(1) }), /no replies to rescore/);
});

test('the rescore log names its source, keeps screen and the case ids, and makes no reply cost', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  try {
    const source = path.join(dir, 'old.json');
    fs.writeFileSync(source, JSON.stringify(storedLog([storedRow('b', [sized(100)])])));
    const logDir = path.join(dir, 'out');
    await runRescore({ opts: { ...parseArgs(['--rescore', '--log', source]), logDir }, cases, judge: pass, spend: new Spend(5), baseline });
    const log = JSON.parse(fs.readFileSync(path.join(logDir, fs.readdirSync(logDir)[0]), 'utf8'));
    assert.equal(log.rescoredFrom, source);
    assert.equal(log.screen, true);
    assert.deepEqual(log.cases, ['b']);
    assert.equal(log.reply_cost_usd, 0);
    assert.equal(log.perCase[0].ratio, 0.5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a --screen rescore of a full-arm log records screen true', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  try {
    const source = path.join(dir, 'full.json');
    fs.writeFileSync(source, JSON.stringify({ ...storedLog([storedRow('b', [sized(100)])]), screen: false }));
    const logDir = path.join(dir, 'out');
    await runRescore({ opts: { ...parseArgs(['--rescore', '--screen', '--log', source]), logDir }, cases, judge: pass, spend: new Spend(5), baseline });
    const log = JSON.parse(fs.readFileSync(path.join(logDir, fs.readdirSync(logDir)[0]), 'utf8'));
    assert.equal(log.screen, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function cutShort(logDir, reply) {
  return async ({ prompt }) => {
    if (!prompt.includes('second')) return reply();
    for (let waited = 0; !fs.existsSync(logDir) || fs.readdirSync(logDir).length === 0; waited += 1) {
      if (waited > 1000) throw new Error('first case never logged');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('cut short');
  };
}

const readLogIn = (logDir) => (file) => JSON.parse(fs.readFileSync(path.join(logDir, file), 'utf8'));

async function writePartialLog({ logDir, opts, two, reply }) {
  await assert.rejects(runScore({ opts, cases: two, reply: cutShort(logDir, reply), judge: pass, spend: spendOf(1), baseline }), /cut short/);
  const [name] = fs.readdirSync(logDir);
  const partial = readLogIn(logDir)(name);
  assert.equal(partial.partial, true);
  assert.deepEqual(partial.perCase.map((p) => p.id), ['a']);
  return { name, partial };
}

async function resumeRecordingPrompts({ opts, two, reply }) {
  const prompts = [];
  await runScore({ opts, cases: two, reply: async (call) => { prompts.push(call.prompt); return reply(); }, judge: pass, spend: new Spend(5), baseline });
  return prompts;
}

function assertFinishedAfterResume(done, partial) {
  assert.equal(done.partial, undefined);
  assert.deepEqual(done.perCase.map((p) => p.id), ['a', 'b']);
  assert.equal(done.score, (0.5 + 0.25) / 2);
  assert.ok(Math.abs(done.reply_cost_usd - (partial.reply_cost_usd + 0.01)) < 1e-9);
}

test('a run cut short leaves a partial log that --resume finishes without calling the model for done cases', async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0.01 });
  const readLog = readLogIn(logDir);
  try {
    const two = [cases[0], { ...cases[1], context: 'second' }];
    const opts = { ...parseArgs(['--runs', '1']), logDir };
    const { name, partial } = await writePartialLog({ logDir, opts, two, reply });
    const prompts = await resumeRecordingPrompts({ opts: { ...opts, resume: path.join(logDir, name) }, two, reply });
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].includes('second'), true);
    const [, finished] = fs.readdirSync(logDir).sort();
    assert.equal(readLog(name).partial, true);
    assertFinishedAfterResume(readLog(finished), partial);
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});

test('--resume refuses a finished log and a log made with other settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0 });
  const attempt = (log, flags = []) => {
    const file = path.join(dir, 'p.json');
    fs.writeFileSync(file, JSON.stringify(log));
    return runScore({ opts: { ...parseArgs(['--runs', '1', ...flags]), logDir: dir, resume: file }, cases, reply, judge: pass, spend: spendOf(1), baseline });
  };
  try {
    await assert.rejects(attempt({ runs: 1, perCase: [] }), /not a partial log/);
    await assert.rejects(attempt({ partial: true, runs: 2, perCase: [] }), /other --runs/);
    await assert.rejects(attempt({ partial: true, runs: 1, ablate: 'no-why', perCase: [] }), /other --runs/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stability and fail labels read finished logs only, never a partial one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-labels-'));
  const file = path.join(dir, 'labels.jsonl');
  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir);
  fs.writeFileSync(file, `${JSON.stringify({ id: 'h#0', dimension: 'facts', question: lidCase.question, facts: lidCase.facts, reply: 'Yes, it stays awake all night. caffeinate -di stops the Mac from sleeping.', label: 'PASS' })}\n`);
  fs.writeFileSync(path.join(logDir, 'a.json'), JSON.stringify({ partial: true, perCase: [{ id: 'lid', replies: ['Yes, it stays awake all night; caffeinate -di stops the Mac from sleeping!'], failed: [] }] }));
  try {
    assert.equal(runAddFailLabels([lidCase], { file, logDir, baseline: {} }).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt log in the log folder is reported, not skipped as partial', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-labels-'));
  const file = path.join(dir, 'labels.jsonl');
  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir);
  fs.writeFileSync(file, `${JSON.stringify({ id: 'h#0', dimension: 'facts', question: lidCase.question, facts: lidCase.facts, reply: 'Yes, it stays awake all night. caffeinate -di stops the Mac from sleeping.', label: 'PASS' })}\n`);
  fs.writeFileSync(path.join(logDir, 'a.json'), '{"runs":');
  try {
    assert.throws(() => runAddFailLabels([lidCase], { file, logDir, baseline: {} }), /a\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--resume refuses a partial log made with another case list or model', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0 });
  const attempt = (log) => {
    const file = path.join(dir, 'p.json');
    fs.writeFileSync(file, JSON.stringify({ partial: true, runs: 1, ablate: null, screen: false, model: parseArgs([]).model, cases: ['a', 'b'], perCase: [], ...log }));
    return runScore({ opts: { ...parseArgs(['--runs', '1']), logDir: dir, resume: file }, cases, reply, judge: pass, spend: spendOf(1), baseline });
  };
  try {
    await assert.rejects(attempt({ cases: ['zzz'] }), /other --runs, --ablate, --screen, --model or --cases/);
    await assert.rejects(attempt({ model: 'other' }), /other --runs, --ablate, --screen, --model or --cases/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--rescore refuses a partial log', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const source = path.join(dir, 'src.json');
  fs.writeFileSync(source, JSON.stringify({ ...storedLog([storedRow('a', ['x'])]), partial: true }));
  try {
    await assert.rejects(runRescore({ opts: { ...parseArgs(['--rescore', '--log', source]), logDir: dir }, cases, judge: pass, spend: spendOf(1), baseline }), /partial/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
