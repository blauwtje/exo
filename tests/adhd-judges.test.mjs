import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DIMENSIONS, batchPrompt, calibrate, claudeJudge, judgeBatch, judgePrompt } from '../benchmarks/adhd/judges.mjs';

test('each dimension has its own prompt asking for PASS or FAIL', () => {
  const prompts = DIMENSIONS.map(judgePrompt);
  assert.equal(new Set(prompts).size, DIMENSIONS.length);
  for (const prompt of prompts) assert.match(prompt, /PASS or FAIL/);
  assert.throws(() => judgePrompt('other'), /unknown judge dimension/);
});

test('calibrate reports agreement per dimension', async () => {
  const labels = [
    { dimension: 'facts', reply: 'a', label: 'PASS', facts: [] },
    { dimension: 'facts', reply: 'b', label: 'FAIL', facts: [] },
    { dimension: 'first-line', reply: 'a', label: 'PASS' },
  ];
  const judge = async () => '1: PASS';
  const report = await calibrate({ labels, judge });
  assert.deepEqual(report, { facts: { agree: 1, total: 2 }, 'first-line': { agree: 1, total: 1 }, scannable: { agree: 0, total: 0 } });
});

test('judgeBatch returns one verdict per reply and treats missing lines as FAIL', async () => {
  const calls = [];
  const judge = async (call) => { calls.push(call); return { text: '1: PASS\n3. fail', cost: 0.5 }; };
  let cost = 0;
  const out = await judgeBatch({ dimension: 'facts', replies: ['A', 'B', 'C'], question: 'Q', facts: ['F'], judge, onCost: (c) => { cost += c; } });
  assert.deepEqual(out, ['PASS', 'FAIL', 'FAIL']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].system, batchPrompt('facts'));
  assert.match(calls[0].input, /Q[\s\S]*F[\s\S]*Reply 1:\nA[\s\S]*Reply 2:\nB[\s\S]*Reply 3:\nC/);
  assert.equal(cost, 0.5);
});

test('a judge call with no total_cost_usd is an error, not $0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\ncat >/dev/null\necho \'{"result":"PASS"}\'\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    assert.throws(() => claudeJudge({ system: 's', input: 'i' }), /total_cost_usd/);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('calibrate judges with the batch prompt that scoring uses', async () => {
  let system;
  const judge = async (call) => { system = call.system; return '1: PASS'; };
  const report = await calibrate({ labels: [{ dimension: 'facts', reply: 'r', question: 'q', facts: ['f'], label: 'PASS' }], judge });
  assert.equal(system, batchPrompt('facts'));
  assert.equal(report.facts.agree, 1);
});
