import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REPOSITORY_ROOT, tempDir } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'benchmarks', 'layout-ab.mjs');
const LAYOUTS = path.join(REPOSITORY_ROOT, 'benchmarks', 'layout-ab');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(LAYOUTS, 'expected.json'), 'utf8'));

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs');
const config = JSON.parse(process.env.FAKE_CONFIG);
fs.appendFileSync(config.calls, 'call\\n');
const prompt = fs.readFileSync(0, 'utf8');
const arm = ['control', 'line', 'pipe'].find((name) => prompt.includes(fs.readFileSync(config.layouts + '/' + name + '.md', 'utf8')));
if (config.fail === arm) process.exit(1);
const expected = JSON.parse(fs.readFileSync(config.layouts + '/expected.json', 'utf8'));
let wrong = config.wrong[arm];
const answers = Object.entries(expected).map(([task, fields]) => {
  const answer = { task: Number(task), ...fields };
  for (const name of Object.keys(fields)) if (wrong-- > 0) answer[name] = 'wrong';
  return answer;
});
process.stdout.write(JSON.stringify({ result: 'Here:\\n' + JSON.stringify(answers), total_cost_usd: config.cost }));
`;

function setup(config) {
  const directory = tempDir('layout-ab-');
  const claude = path.join(directory, 'claude');
  const calls = path.join(directory, 'calls.log');
  fs.writeFileSync(claude, FAKE_CLAUDE, { mode: 0o755 });
  fs.writeFileSync(calls, '');
  const env = { ...process.env, FAKE_CONFIG: JSON.stringify({ calls, layouts: LAYOUTS, cost: 0.01, ...config }) };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--claude', claude, ...args], { encoding: 'utf8', env });
  return { run, callCount: () => fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).length };
}

test('the expected file covers 8 tasks with four fields each', () => {
  assert.equal(Object.keys(EXPECTED).length, 8);
  for (const fields of Object.values(EXPECTED)) assert.deepEqual(Object.keys(fields), ['dependsOn', 'files', 'data', 'proof']);
});

test('per-line beating pipe with a lower control gives switch and prints counts per arm', () => {
  const { run, callCount } = setup({ wrong: { pipe: 6, line: 0, control: 12 } });
  const result = run('--runs', '5');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^pipe: runs 5, finished 5, errors 0, rate 0\.813, spread 0\.000, cost 0\.0500 USD$/m);
  assert.match(result.stdout, /^line: runs 5, finished 5, errors 0, rate 1\.000/m);
  assert.match(result.stdout, /^control: runs 5, finished 5, errors 0, rate 0\.625/m);
  assert.match(result.stdout, /^Verdict: switch$/m);
  assert.equal(callCount(), 15);
});

test('pipe beating per-line gives keep', () => {
  const { run } = setup({ wrong: { pipe: 0, line: 6, control: 12 } });
  assert.match(run('--runs', '5').stdout, /^Verdict: keep$/m);
});

test('equal arms give inconclusive', () => {
  const { run } = setup({ wrong: { pipe: 2, line: 2, control: 12 } });
  assert.match(run('--runs', '5').stdout, /^Verdict: inconclusive$/m);
});

test('a control that does not score lower makes the run void', () => {
  const { run } = setup({ wrong: { pipe: 6, line: 0, control: 0 } });
  assert.match(run('--runs', '5').stdout, /^Verdict: void$/m);
});

test('failed calls count as errors and an arm without finished runs is void', () => {
  const { run } = setup({ wrong: { pipe: 0, line: 0, control: 0 }, fail: 'line' });
  const result = run('--runs', '5');
  assert.match(result.stdout, /^line: runs 5, finished 0, errors 5/m);
  assert.match(result.stdout, /^Verdict: void$/m);
});

test('the cost cap stops the run', () => {
  const { run, callCount } = setup({ wrong: { pipe: 0, line: 0, control: 0 }, cost: 0.4 });
  const result = run('--runs', '5', '--max-cost-usd', '1');
  assert.equal(callCount(), 3);
  assert.match(result.stdout, /^pipe: runs 1, finished 1/m);
});

test('--dry-run makes no call', () => {
  const { run, callCount } = setup({ wrong: { pipe: 0, line: 0, control: 0 } });
  const result = run('--runs', '10', '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run: 30 calls/);
  assert.equal(callCount(), 0);
});

test('fewer than 5 runs exits with usage', () => {
  const { run } = setup({ wrong: { pipe: 0, line: 0, control: 0 } });
  const result = run('--runs', '4');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--runs needs an integer of at least 5/);
});
