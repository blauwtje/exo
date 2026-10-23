import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { batchPrompt } from '../benchmarks/adhd/judges.mjs';
import { Spend, buildBaseline, buildLabelRows, calibrateLines, checkBaseline, claudeReply, runToLabel, scoreCases } from '../benchmarks/adhd-score.mjs';

const cases = [
  { id: 'a', context: 'C', question: 'Q', facts: ['f'], literals: [['KEY']], lead: [] },
  { id: 'b', context: 'C', question: 'Q', facts: ['f'], literals: [], lead: [] },
];
const spendOf = (maxUsd) => ({ maxUsd, total: 0, add(c) { this.total += c; if (this.total > maxUsd) throw new Error('passed --max-usd'); } });
const pass = async ({ input }) => [...input.matchAll(/^Reply (\d+):/gm)].map((m) => `${m[1]}: PASS`).join('\n');
const passCost = (cost) => async (call) => ({ text: await pass(call), cost });
const baseline = { a: { mean: 100 }, b: { mean: 200 } };

test('score is the mean per-case token ratio against the baseline', async () => {
  const reply = async ({ prompt }) => ({ text: 'KEY here.', tokens: 50, cost: 0.01, prompt });
  const out = await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(1) });
  assert.equal(out.score, (0.5 + 0.25) / 2);
  assert.equal(out.runs, 1);
});

test('a failed gate scores the case 1.0', async () => {
  const reply = async () => ({ text: 'no literal.', tokens: 10, cost: 0 });
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge: pass, spend: spendOf(1) });
  assert.equal(out.score, 1);
  assert.deepEqual(out.perCase[0].failed, ['literals']);
});

test('a failed judge scores the case 1.0', async () => {
  const reply = async () => ({ text: 'KEY here.', tokens: 10, cost: 0 });
  const judge = async (call) => (call.system === batchPrompt('scannable') ? '1: FAIL' : pass(call));
  const out = await scoreCases({ cases: [cases[0]], baseline, reply, judge, spend: spendOf(1) });
  assert.equal(out.score, 1);
  assert.deepEqual(out.perCase[0].failed, ['judge:scannable']);
});

test('adhd arm runs 1 per case by default and --runs overrides', async () => {
  let calls = 0;
  const reply = async () => { calls += 1; return { text: 'KEY.', tokens: 10, cost: 0.3 }; };
  const out = await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(10) });
  assert.equal(out.runs, 1);
  assert.equal(calls, 2);
  calls = 0;
  await scoreCases({ cases, baseline, reply, judge: pass, spend: spendOf(10), runs: 3 });
  assert.equal(calls, 6);
});

test('judge spend counts toward the cap', async () => {
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: 0 });
  const judge = passCost(0.1);
  const spend = spendOf(1);
  await scoreCases({ cases: [cases[0]], baseline, reply, judge, spend });
  assert.ok(Math.abs(spend.total - 3 * 0.1) < 1e-9);
  await assert.rejects(scoreCases({ cases: [cases[0]], baseline, reply, judge, spend: spendOf(0.2) }), /max-usd/);
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

test('buildLabelRows writes 5 null-label rows per dimension mixing default and adhd replies', () => {
  const base = { a: { replies: ['d1', 'd2', 'd3'] }, b: { replies: ['d4', 'd5', 'd6'] } };
  const rows = buildLabelRows({ cases, baseline: base, adhdReplies: { a: ['x1', 'x2'], b: ['x3', 'x4'] } });
  assert.equal(rows.length, 15);
  for (const dimension of ['facts', 'first-line', 'scannable']) {
    const own = rows.filter((r) => r.dimension === dimension);
    assert.equal(own.length, 5);
    assert.ok(own.some((r) => r.id.includes('-default-')) && own.some((r) => r.id.includes('-adhd-')));
  }
  assert.deepEqual(Object.keys(rows[0]), ['id', 'dimension', 'question', 'facts', 'reply', 'label']);
  assert.ok(rows.every((r) => r.label === null));
});

test('buildLabelRows errors when too few replies are stored', () => {
  assert.throws(() => buildLabelRows({ cases, baseline: { a: { replies: ['d'] } } }), /need 5/);
});

test('calibrateLines prints agreement per judge', async () => {
  const labels = ['facts', 'first-line', 'scannable'].flatMap((dimension) =>
    ['PASS', 'FAIL'].map((label, i) => ({ id: `${dimension}${i}`, dimension, question: 'Q', facts: ['f'], reply: 'r', label })));
  const lines = await calibrateLines({ labels, judge: async () => 'PASS' });
  assert.deepEqual(lines, ['facts 1/2', 'first-line 1/2', 'scannable 1/2']);
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
  assert.ok(Math.abs(spend.reply - 0.02) < 1e-9 && Math.abs(spend.judge - 0.3) < 1e-9);
});

test('projection re-checks after every case, so a costlier later case stops the run', async () => {
  const four = [...cases, { ...cases[1], id: 'c' }, { ...cases[1], id: 'd' }];
  const base = { ...baseline, c: { mean: 200 }, d: { mean: 200 } };
  const costs = [0.1, 0.5, 0.5, 0.5];
  let i = 0;
  const reply = async () => ({ text: 'KEY.', tokens: 10, cost: costs[i++] });
  await assert.rejects(scoreCases({ cases: four, baseline: base, reply, judge: pass, spend: spendOf(1.2) }), /projected_usd/);
  assert.equal(i, 3);
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

test('a case with one gate-failed run skips its judge calls', async () => {
  let judged = 0;
  let k = 0;
  const reply = async () => ({ text: k++ === 0 ? '# Title' : 'Plain answer.', tokens: 1, cost: 0 });
  const judge = async (call) => { judged += 1; return pass(call); };
  const out = await scoreCases({ cases: [{ ...cases[1], id: 'a' }], baseline, reply, judge, spend: spendOf(9), runs: 2 });
  assert.equal(judged, 0);
  assert.equal(out.score, 1);
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
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 15);
});
