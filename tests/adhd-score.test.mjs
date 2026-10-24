import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ADHD_RUNS, SCORE_MAX_USD, Spend, buildBaseline, buildLabelRows, calibrateLines, checkBaseline, callStats, caseLine, claudeReply, parseArgs, runAddFailLabels, runToLabel, scoreCases, stabilityItems, visibleTokens } from '../benchmarks/adhd-score.mjs';
import { buildFailRows, dropFact } from '../benchmarks/adhd/labels.mjs';

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

test('a hung claude call is killed at the cap and retried once, then fails clearly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  const marker = path.join(dir, 'seen');
  const ok = '{"result":"x","usage":{"output_tokens":1},"total_cost_usd":0}';
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat >/dev/null\nif [ ! -e ${marker} ]; then touch ${marker}; exec sleep 30; fi\necho '${ok}'\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${dir}:${savedPath}`;
  process.env.EXO_ADHD_CALL_MS = '300';
  callStats.timeouts = 0;
  try {
    const out = await claudeReply({ arm: 'default', prompt: 'q' });
    assert.equal(out.text, 'x');
    assert.equal(callStats.timeouts, 1);
    fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\ncat >/dev/null\nexec sleep 30\n', { mode: 0o755 });
    await assert.rejects(claudeReply({ arm: 'default', prompt: 'q' }), /timed out twice/);
    assert.equal(callStats.timeouts, 3);
  } finally {
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

test('the adhd arm defaults to 3 runs and a $3 cap', () => {
  const opts = parseArgs([]);
  assert.equal(ADHD_RUNS, 3);
  assert.equal(opts.runs, 3);
  assert.equal(SCORE_MAX_USD, 3);
  assert.equal(opts.maxUsd, 3);
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

test('--all needs --baseline', () => {
  assert.equal(parseArgs(['--baseline', '--all']).all, true);
  assert.throws(() => parseArgs(['--all']), /--baseline/);
});
