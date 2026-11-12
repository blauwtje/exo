import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { judgeStatusLines, quickPowerLine } from '../benchmarks/adhd/quick-report.mjs';
import { Spend, judgeRate, parseArgs, readCases, readQuick, runQuick, selectCases } from '../benchmarks/adhd-score.mjs';
import { tempDir } from './harness.mjs';

const references = fs.readFileSync(new URL('../benchmarks/adhd/references.jsonl', import.meta.url), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const cases = selectCases(readCases(), { caseIds: readQuick() });
const promptOf = (c) => `${c.context}\n\n${c.question}`;
const caseOf = (prompt) => cases.find((c) => promptOf(c) === prompt);
const referenceOf = (id) => references.find((r) => r.id === id);
const concise = Object.fromEntries(cases.map((c) => [c.id, { replies: ['x'], tokens: [200], mean: 200, cost: 0.01, model: 'm' }]));
const verdicts = (input, failing = []) => [...input.matchAll(/^Fact (\d+):/gm)].map((m) => `${m[1]}: ${failing.includes(Number(m[1])) ? 'FAIL' : 'PASS'}`).join('\n');

const goodReply = (log = []) => async ({ arm, prompt }) => {
  const c = caseOf(prompt);
  log.push(`start ${c.id}`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  log.push(`end ${c.id}`);
  return { text: referenceOf(c.id).good, tokens: 100, cost: 0.01, arm };
};

const optsIn = (dir, flags = []) => ({ ...parseArgs(flags), logDir: dir, model: 'm' });

async function quickIn(task) {
  const dir = tempDir('exo-adhd-quick-');
  return await task(dir);
}

const logIn = (dir) => JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.json'))), 'utf8'));

test('a quick run over the good reference replies logs the five metrics, cost and duration', async () => {
  await quickIn(async (dir) => {
    const judge = async ({ input }) => verdicts(input);
    await runQuick({ opts: optsIn(dir), cases, reply: goodReply(), judge, spend: new Spend(1), concise });
    const log = logIn(dir);
    assert.equal(log.mode, 'quick');
    assert.equal(log.arm, 'adhd');
    assert.equal(log.billedMedianRatio, 0.5);
    assert.ok(log.medianRatio > 0);
    assert.equal(log.perCase[0].baselineVisible, 1);
    assert.equal(log.perCase[0].ratio, log.perCase[0].visible / 1);
    assert.equal(log.factsShare, 100);
    assert.deepEqual([log.answerFirst, log.cleanDeliverable, log.questionLast, log.factsKept], [100, 100, 100, 100]);
    assert.ok(Math.abs(log.cost_usd - (0.01 * cases.length + log.judge_cost_usd)) < 1e-9);
    assert.ok(log.durationMs >= 0);
    assert.deepEqual(log.perCase.map((p) => p.id), cases.map((c) => c.id));
    assert.equal(log.perCase[0].baselineTokens, 200);
  });
});

test('the first reply finishes before the other ten start together', async () => {
  await quickIn(async (dir) => {
    const log = [];
    await runQuick({ opts: optsIn(dir), cases, reply: goodReply(log), judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    assert.deepEqual(log.slice(0, 2), [`start ${cases[0].id}`, `end ${cases[0].id}`]);
    const rest = log.slice(2);
    assert.deepEqual(rest.slice(0, 10).map((entry) => entry.split(' ')[0]), Array(10).fill('start'));
  });
});

test('a bad reference reply lowers the metric it breaks', async () => {
  await quickIn(async (dir) => {
    const bad = referenceOf('deliverable-commit-gate');
    const reply = async ({ prompt }) => {
      const c = caseOf(prompt);
      return { text: c.id === bad.id ? bad.bad : referenceOf(c.id).good, tokens: 100, cost: 0.01 };
    };
    await runQuick({ opts: optsIn(dir), cases, reply, judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    const log = logIn(dir);
    assert.equal(bad.breaks, 'deliverable');
    assert.ok(log.cleanDeliverable < 100);
    assert.equal(log.answerFirst, 100);
  });
});

test('the facts judge runs only for replies that pass the literals gate', async () => {
  await quickIn(async (dir) => {
    const bad = referenceOf('failure-q1');
    const judged = [];
    const judge = async ({ input }) => { judged.push(input); return verdicts(input); };
    const reply = async ({ prompt }) => {
      const c = caseOf(prompt);
      return { text: c.id === bad.id ? bad.bad : referenceOf(c.id).good, tokens: 100, cost: 0.01 };
    };
    await runQuick({ opts: optsIn(dir), cases, reply, judge, spend: new Spend(1), concise });
    assert.equal(bad.breaks, 'literals');
    assert.equal(judged.length, (cases.length - 1) * 3);
    assert.ok(judged.every((input) => !input.includes(bad.bad)));
    assert.ok(logIn(dir).factsKept < 100);
  });
});

test('a fact the judge fails lowers facts-kept', async () => {
  await quickIn(async (dir) => {
    const judge = async ({ input }) => verdicts(input, [1]);
    await runQuick({ opts: optsIn(dir), cases, reply: goodReply(), judge, spend: new Spend(1), concise });
    assert.equal(logIn(dir).factsKept, 0);
  });
});

test('a concise store missing a case or holding another model refuses and names --concise-baseline', async () => {
  await quickIn(async (dir) => {
    const run = (store) => runQuick({ opts: optsIn(dir), cases, reply: goodReply(), judge: async () => '', spend: new Spend(1), concise: store });
    const { [cases[0].id]: dropped, ...missing } = concise;
    await assert.rejects(run(missing), new RegExp(`${cases[0].id}.*--concise-baseline`));
    await assert.rejects(run({ ...concise, [cases[0].id]: { ...dropped, model: 'other' } }), /--concise-baseline/);
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});

test('a quick run fails once spend passes --max-usd and logs the spend', async () => {
  await quickIn(async (dir) => {
    const judge = async ({ input }) => verdicts(input);
    const reply = async ({ prompt }) => ({ text: referenceOf(caseOf(prompt).id).good, tokens: 100, cost: caseOf(prompt).id === cases[0].id ? 0.001 : 0.01 });
    await assert.rejects(runQuick({ opts: optsIn(dir, ['--max-usd', '0.05']), cases, reply, judge, spend: new Spend(0.05), concise }), /passed --max-usd 0\.05/);
    const log = logIn(dir);
    assert.equal(log.mode, 'quick');
    assert.match(log.error, /passed --max-usd/);
    assert.ok(log.cost_usd > 0.05);
  });
});

test('a first reply that prices the run over --max-usd refuses before the other ten start and logs it', async () => {
  await quickIn(async (dir) => {
    let started = 0;
    const reply = async ({ prompt }) => {
      started += 1;
      return { text: referenceOf(caseOf(prompt).id).good, tokens: 100, cost: 0.1 };
    };
    await assert.rejects(runQuick({ opts: optsIn(dir), cases, reply, judge: async () => '', spend: new Spend(0.3), concise }), /projected_usd=1\.2000 over --max-usd 0\.3/);
    assert.equal(started, 1);
    const log = logIn(dir);
    assert.match(log.error, /projected_usd/);
    assert.ok(Math.abs(log.cost_usd - 0.1) < 1e-9);
  });
});

test('a quick log in the log dir does not hide the newest full-run log from judgeRate', async () => {
  await quickIn(async (dir) => {
    fs.writeFileSync(path.join(dir, '2026-01-01.json'), JSON.stringify({ judge_cost_usd: 0.01, perCase: [{ id: 'a', replies: ['x', 'y'] }] }));
    fs.writeFileSync(path.join(dir, '2026-01-02.json'), JSON.stringify({ mode: 'quick', judge_cost_usd: 0.001, perCase: [{ id: 'a', reply: 'x' }] }));
    assert.ok(Math.abs(judgeRate(dir) - 0.005) < 1e-9);
  });
});

const flakyReply = (bad) => {
  const seen = {};
  return async ({ prompt }) => {
    const id = caseOf(prompt).id;
    seen[id] = (seen[id] ?? 0) + 1;
    return { text: id === bad.id && seen[id] === 2 ? bad.bad : referenceOf(id).good, tokens: 100, cost: 0.01 };
  };
};

test('--answers 2 makes two answers per case, averages each row and prints the power line', async () => {
  await quickIn(async (dir) => {
    let calls = 0;
    const bad = referenceOf('deliverable-commit-gate');
    const inner = flakyReply(bad);
    const reply = async (call) => { calls += 1; return inner(call); };
    const record = await runQuick({ opts: optsIn(dir, ['--answers', '2']), cases, reply, judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    const first = record.perCase[0];
    assert.equal(calls, cases.length * 2);
    assert.equal(record.answers, 2);
    assert.equal(record.perCase.length, cases.length);
    assert.equal(first.ratios.length, 2);
    assert.ok(record.perCase.find((p) => p.id === bad.id).failed.length > 0);
    assert.equal(first.ratio, (first.ratios[0] + first.ratios[1]) / 2);
    assert.match(quickPowerLine(record.perCase, 2), /power: 12 tasks x 2 samples x 2 arms = 48 runs; an effect of 0.1 needs \d+ tasks.*answers_per_case_needed=/);
  });
});

test('agent-made labels print AGENT-LABELS instead of NO-LABELS', () => {
  const dir = tempDir('exo-adhd-labels-');
  const file = path.join(dir, 'labels.jsonl');
  const row = (label) => JSON.stringify({ id: 'a#0', dimension: 'facts', label, labeler: 'agent' });
  fs.writeFileSync(file, `${row('PASS')}\n${row('FAIL')}\n`);
  assert.deepEqual(judgeStatusLines(file), ['AGENT-LABELS adhd-facts n 2 labels made by an agent, not by the user']);
});

test('the power line prices a paired design: close answers within widely spread cases need few answers', () => {
  const perCase = Array.from({ length: 12 }, (_, at) => ({ id: `c${at}`, ratios: [0.2 + at * 0.15, 0.21 + at * 0.15] }));
  const line = quickPowerLine(perCase, 2);
  assert.doesNotMatch(line, /over 20/);
  assert.match(line, /answers_per_case_needed=\d+/);
});

test('the quick record keeps every answer with its verdicts and the --ablate value', async () => {
  await quickIn(async (dir) => {
    const bad = referenceOf('deliverable-commit-gate');
    const record = await runQuick({ opts: optsIn(dir, ['--answers', '2', '--ablate', 'one-sentence']), cases, reply: flakyReply(bad), judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    const entry = record.perCase.find((p) => p.id === bad.id);
    assert.equal(record.ablate, 'one-sentence');
    assert.equal(entry.answers.length, 2);
    assert.deepEqual(Object.keys(entry.answers[0]).sort(), ['billed', 'failed', 'missing', 'text', 'visible']);
    assert.equal(entry.answers[1].text, bad.bad);
    assert.ok(entry.answers[1].failed.length > 0);
  });
});

test('--base-style pairs a base arm that loses a fact with a candidate that keeps it and counts both arms in the projection', async () => {
  await quickIn(async (dir) => {
    const lossy = referenceOf('failure-q1');
    const styleFile = path.join(dir, 'base.md');
    fs.writeFileSync(styleFile, 'old style');
    const flags = ['--base-style', styleFile];
    const sides = [];
    const reply = async ({ prompt, side }) => {
      const id = caseOf(prompt).id;
      sides.push(side);
      return { text: side === 'base' && id === lossy.id ? lossy.bad : referenceOf(id).good, tokens: 100, cost: 0.01 };
    };
    const record = await runQuick({ opts: optsIn(dir, flags), cases, reply, judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    assert.equal(sides.filter((side) => side === 'base').length, cases.length);
    assert.equal(record.baseStyle, styleFile);
    assert.equal(record.base.perCase.length, cases.length);
    assert.ok(record.base.factsKept < record.factsKept);
    assert.ok(record.paired.factsKept.mean > 0);
    assert.equal(record.paired.factsKept.n, cases.length);
    assert.equal(typeof record.paired.ratio.mean, 'number');
    const refusal = tempDir('exo-adhd-quick-');
    const pricey = async ({ prompt }) => ({ text: referenceOf(caseOf(prompt).id).good, tokens: 100, cost: 0.1 });
    await assert.rejects(runQuick({ opts: optsIn(refusal, flags), cases, reply: pricey, judge: async () => '', spend: new Spend(0.3), concise }), /projected_usd=2\.4000 over --max-usd 0\.3/);
  });
});

test('--base-style runs the candidate first reply alone, then the base first reply alone, then the rest together', async () => {
  await quickIn(async (dir) => {
    const styleFile = path.join(dir, 'base.md');
    fs.writeFileSync(styleFile, 'old style');
    const log = [];
    const reply = async ({ prompt, side }) => {
      const id = caseOf(prompt).id;
      log.push(`start ${side} ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(`end ${side} ${id}`);
      return { text: referenceOf(id).good, tokens: 100, cost: 0.01 };
    };
    await runQuick({ opts: optsIn(dir, ['--base-style', styleFile]), cases, reply, judge: async ({ input }) => verdicts(input), spend: new Spend(1), concise });
    assert.deepEqual(log.slice(0, 4), [`start candidate ${cases[0].id}`, `end candidate ${cases[0].id}`, `start base ${cases[0].id}`, `end base ${cases[0].id}`]);
    assert.deepEqual(log.slice(4, 4 + (cases.length * 2 - 2)).map((entry) => entry.split(' ')[0]), Array(cases.length * 2 - 2).fill('start'));
  });
});
