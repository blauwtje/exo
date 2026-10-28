import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Spend, buildBaseline, claudeReply, parseArgs, readCases, readQuick, selectCases } from '../benchmarks/adhd-score.mjs';

const cases = [
  { id: 'a', context: 'C', question: 'Q' },
  { id: 'b', context: 'C', question: 'Q' },
];
const reply = (calls) => async ({ arm, prompt }) => {
  calls.push(arm);
  return { text: `${arm} ${prompt.length}`, tokens: 7, cost: 0.01 };
};

test('the quick list names 10 existing cases', () => {
  const quick = readQuick();
  assert.equal(quick.length, 10);
  assert.equal(selectCases(readCases(), { caseIds: quick }).length, 10);
});

test('the concise arm appends "Answer concisely." to the default claude call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' "$@" > ${argsFile}\necho '{"result":"x","usage":{"output_tokens":1},"total_cost_usd":0}'\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    await claudeReply({ arm: 'concise', prompt: 'q' });
    const args = fs.readFileSync(argsFile, 'utf8').split('\n');
    assert.equal(args[args.indexOf('--append-system-prompt') + 1], 'Answer concisely.');
    assert.ok(!args.includes('--plugin-dir'));
    assert.throws(() => claudeReply({ arm: 'nope', prompt: 'q' }), /unknown arm nope/);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the caveman arm appends the concise prompt and the caveman rules, without the plugin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' "$@" > ${argsFile}\necho '{"result":"x","usage":{"output_tokens":1},"total_cost_usd":0}'\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    await claudeReply({ arm: 'caveman', prompt: 'q' });
    const args = fs.readFileSync(argsFile, 'utf8');
    const rules = fs.readFileSync(new URL('../benchmarks/adhd/arms/caveman.md', import.meta.url), 'utf8').trim();
    assert.ok(args.includes(`Answer concisely.\n\n${rules}`));
    assert.ok(!args.includes('--plugin-dir'));
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a concise build replies in the concise arm and stores the model on each row', async () => {
  const calls = [];
  const out = await buildBaseline({ cases, reply: reply(calls), spend: new Spend(1), runs: 2, arm: 'concise', model: 'm1' });
  assert.deepEqual(calls, ['concise', 'concise', 'concise', 'concise']);
  assert.equal(out.a.model, 'm1');
  assert.equal(out.a.replies.length, 2);
  assert.equal(out.a.mean, 7);
});

test('a concise build keeps rows of its model and redoes rows of another model or none', async () => {
  const calls = [];
  const existing = { a: { replies: ['keep'], tokens: [1], mean: 1, cost: 0, model: 'm1' }, b: { replies: ['old'], tokens: [1], mean: 1, cost: 0, model: 'm0' } };
  const out = await buildBaseline({ cases, reply: reply(calls), spend: new Spend(1), runs: 1, existing, arm: 'concise', model: 'm1' });
  assert.equal(out.a.replies[0], 'keep');
  assert.equal(out.b.model, 'm1');
  assert.equal(calls.length, 1);
  const noModel = await buildBaseline({ cases: [cases[0]], reply: reply([]), spend: new Spend(1), runs: 1, existing: { a: { replies: ['x'], tokens: [1], mean: 1, cost: 0 } }, arm: 'concise', model: 'm1' });
  assert.equal(noModel.a.model, 'm1');
});

test('--concise-baseline conflicts with --baseline, and --all and --cases apply to it', () => {
  assert.throws(() => parseArgs(['--baseline', '--concise-baseline']), /cannot combine/);
  assert.equal(parseArgs(['--concise-baseline', '--all']).all, true);
  assert.deepEqual(parseArgs(['--concise-baseline', '--cases', 'a,b']).caseIds, ['a', 'b']);
  assert.throws(() => parseArgs(['--concise-baseline', '--rescore', '--log', 'f']), /--rescore/);
});
