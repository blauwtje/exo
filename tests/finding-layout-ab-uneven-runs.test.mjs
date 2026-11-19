import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REPOSITORY_ROOT, tempDir } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'benchmarks', 'layout-ab.mjs');
const LAYOUTS = path.join(REPOSITORY_ROOT, 'benchmarks', 'layout-ab');

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs');
const config = JSON.parse(process.env.FAKE_CONFIG);
const prompt = fs.readFileSync(0, 'utf8');
const arm = ['control', 'line', 'pipe'].find((name) => prompt.includes(fs.readFileSync(config.layouts + '/' + name + '.md', 'utf8')));
const expected = JSON.parse(fs.readFileSync(config.layouts + '/expected.json', 'utf8'));
let seen = 0;
if (arm === 'control') {
  seen = fs.existsSync(config.counter) ? Number(fs.readFileSync(config.counter, 'utf8')) : 0;
  fs.writeFileSync(config.counter, String(seen + 1));
}
if (arm === 'control' && seen < config.controlErrors) {
  process.stdout.write(JSON.stringify({ is_error: true, result: 'overloaded', total_cost_usd: config.cost }));
  process.exit(1);
}
let wrong = config.wrong[arm];
const answers = Object.entries(expected).map(([task, fields]) => {
  const answer = { task: Number(task), ...fields };
  for (const name of Object.keys(fields)) if (wrong-- > 0) answer[name] = 'wrong';
  return answer;
});
process.stdout.write(JSON.stringify({ result: JSON.stringify(answers), total_cost_usd: config.cost }));
`;

function run(config) {
  const directory = tempDir('layout-ab-uneven-');
  const claude = path.join(directory, 'claude');
  fs.writeFileSync(claude, FAKE_CLAUDE, { mode: 0o755 });
  const env = { ...process.env, FAKE_CONFIG: JSON.stringify({ counter: path.join(directory, 'counter'), layouts: LAYOUTS, cost: 0.01, controlErrors: 6, wrong: { pipe: 6, line: 0, control: 12 }, ...config }) };
  return spawnSync(process.execPath, [SCRIPT, '--claude', claude, '--runs', '10'], { encoding: 'utf8', env });
}

test('a failed call that reports a cost still counts toward the arm cost', () => {
  const result = run({});
  assert.match(result.stdout, /^control: runs 10, finished 4, errors 6, .*cost 0\.1000 USD$/m, result.stdout);
});

test('uneven errors across arms make the verdict void', () => {
  const result = run({});
  assert.match(result.stdout, /^control: runs 10, finished 4, errors 6/m, result.stdout);
  assert.match(result.stdout, /^Verdict: void$/m, result.stdout);
});
