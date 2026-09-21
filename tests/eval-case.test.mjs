// eval-case.mjs splits one eval case's runs over runner processes per arm,
// merges them into one aggregate and hands it to eval-reasons.mjs. A stand-in
// `claude` on PATH plays the runner, so no model is called.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const CASE = 'savings-report-reads-cold';

// Logs each call, then writes the aggregate a single-arm runner writes: every run passes,
// or no case at all when STAND_IN_NO_CASE is set.
// STAND_IN_EXIT sets the exit code the stand-in runner returns.
const STAND_IN = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
fs.appendFileSync(process.env.STAND_IN_LOG, JSON.stringify(args) + '\\n');
if (process.env.STAND_IN_EXIT) process.exit(Number(process.env.STAND_IN_EXIT));
const runs = Array.from({ length: Number(value('--runs')) }, () => ({
  costUsd: 0.25, judgeCostUsd: 0.05, error: null,
  graders: [{ name: 'names-the-mechanisms', passed: true, judgeVotes: [true, true, true], evidence: 'text' }]
}));
const graders = [{ name: 'names-the-mechanisms', type: 'llm', config: { criteria: 'PASS when.', focus: 'last_message' } }];
const pluginArm = args.includes('--ablation');
const cases = process.env.STAND_IN_NO_CASE ? [] : [{ name: value('--case'), graders, arms: { with: runs } }];
const aggregate = { suite: { plugins: pluginArm ? [{ name: 'exo' }] : [] }, cases };
fs.mkdirSync(value('--output-dir'), { recursive: true });
fs.writeFileSync(path.join(value('--output-dir'), 'aggregate-result.json'), JSON.stringify(aggregate));
`;

async function scratchRepository(caseYaml) {
  const directory = await fixture();
  for (const relative of ['eval-case.mjs', 'eval-reasons.mjs']) {
    await fs.copyFile(path.join(REPOSITORY, relative), path.join(directory, relative));
  }
  await fs.symlink(path.join(REPOSITORY, 'node_modules'), path.join(directory, 'node_modules'));
  const caseDirectory = path.join(directory, 'evals', CASE);
  await fs.mkdir(path.join(caseDirectory, 'graders'), { recursive: true });
  await fs.writeFile(path.join(caseDirectory, 'prompt.md'), `---\nname: ${CASE}\nruns: 10\n---\n\nWhat did exo save?\n`);
  if (caseYaml !== undefined) await fs.writeFile(path.join(caseDirectory, 'case.yaml'), caseYaml);
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  return directory;
}

async function runCase(args, extraEnv = {}, caseYaml = undefined) {
  const directory = await scratchRepository(caseYaml);
  const log = path.join(directory, 'calls.log');
  const outcome = await run(path.join(directory, 'eval-case.mjs'), ['--case', CASE, ...args], {
    cwd: directory,
    env: { PATH: `${path.join(directory, 'bin')}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, ...extraEnv }
  });
  const calls = (await fs.readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { directory, outcome, calls };
}

const flag = (call, name) => call[call.indexOf(name) + 1];

async function mergedAggregate(directory, stdout) {
  const relative = stdout.match(/^results in (.+)$/m)[1];
  return JSON.parse(await fs.readFile(path.join(directory, relative, 'aggregate-result.json'), 'utf8'));
}

test('the full run keeps the case run count and splits it over runner processes above their cap of 8', async () => {
  const { directory, outcome, calls } = await runCase(['--mode', 'full', '--arm', 'no-plugin', '--concurrency', '10']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.deepEqual(calls.map((call) => [flag(call, '--runs'), flag(call, '--concurrency')]), [['5', '5'], ['5', '5']]);
  assert.ok(calls.every((call) => !call.includes('--ablation') && flag(call, '--judge-model') === 'sonnet'));
  const repository = await fs.realpath(directory);
  assert.ok(calls.every((call) => call[2] !== repository), 'the no-plugin arm ran from the repository, where the plugin resolves');
  const aggregate = await mergedAggregate(directory, outcome.stdout);
  assert.deepEqual(Object.keys(aggregate.cases[0].arms), ['no-plugin']);
  assert.equal(aggregate.cases[0].arms['no-plugin'].length, 10);
  assert.equal(aggregate.suite.authoritative, true);
  assert.match(outcome.stdout, /\tno-plugin\tnames-the-mechanisms\t100% \(10\/10\)\t0\t0\t0$/m);
  assert.match(outcome.stdout, /^wall time \d+s \(eval \d+s\), cost \$3\.00 /m);
});

test('the draft runs three no-plugin runs in one process and says it is not authoritative', async () => {
  const { outcome, calls } = await runCase(['--mode', 'draft', '--arm', 'no-plugin']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.deepEqual(calls.map((call) => [flag(call, '--runs'), flag(call, '--concurrency')]), [['3', '3']]);
  assert.match(outcome.stdout, /^DRAFT: not authoritative\./m);
});

test('both arms run the plugin arm from the repository with ablation off, every run in flight by default', async () => {
  const { directory, outcome, calls } = await runCase(['--arm', 'both']);
  assert.deepEqual(calls.map((call) => flag(call, '--concurrency')), ['5', '5', '5', '5']);
  assert.equal(outcome.code, 0, outcome.stderr);
  const pluginCalls = calls.filter((call) => call.includes('--ablation'));
  assert.equal(pluginCalls.length, 2);
  const repository = await fs.realpath(directory);
  assert.ok(pluginCalls.every((call) => call[2] === repository && flag(call, '--ablation') === 'none'));
  const aggregate = await mergedAggregate(directory, outcome.stdout);
  assert.deepEqual(Object.keys(aggregate.cases[0].arms).sort(), ['no-plugin', 'plugin']);
});

test('a run without a valid --arm refuses before any runner call and names the case and the arms', async () => {
  for (const armArgs of [[], ['--arm', 'plugins']]) {
    const { outcome, calls } = await runCase(['--mode', 'draft', ...armArgs]);
    assert.equal(outcome.code, 1, `${JSON.stringify(armArgs)} ran`);
    assert.match(outcome.stderr, new RegExp(`--arm is required for case ${CASE}: no-plugin .*, plugin .* or both `));
    assert.deepEqual(calls, []);
  }
});

test('a runner result without the case fails instead of reporting nothing', async () => {
  const { outcome } = await runCase(['--mode', 'draft', '--arm', 'no-plugin'], { STAND_IN_NO_CASE: '1' });
  assert.equal(outcome.code, 1);
  assert.match(outcome.stderr, /expected case count 1/);
});

test('every runner call carries the cost ceiling', async () => {
  const { outcome, calls } = await runCase(['--arm', 'both']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => flag(call, '--max-cost-usd') === '5'));
});

test('a runner stopped by the cost ceiling ends the run without a verdict', async () => {
  const { outcome } = await runCase(['--mode', 'draft', '--arm', 'no-plugin'], { STAND_IN_EXIT: '2' });
  assert.equal(outcome.code, 1);
  assert.match(outcome.stderr, /cost ceiling of \$5/);
  assert.doesNotMatch(outcome.stdout, /^GATE /m);
});

test('a named subject model reaches every runner call and the merged aggregate', async () => {
  const named = await runCase(['--mode', 'draft', '--arm', 'no-plugin', '--model', 'opus']);
  assert.equal(named.outcome.code, 0, named.outcome.stderr);
  assert.ok(named.calls.every((call) => flag(call, '--model') === 'opus'));
  assert.equal((await mergedAggregate(named.directory, named.outcome.stdout)).suite.subjectModel, 'opus');
  assert.match(named.outcome.stdout, /subject opus/);
  const unnamed = await runCase(['--mode', 'draft', '--arm', 'no-plugin']);
  assert.ok(unnamed.calls.every((call) => !call.includes('--model')));
  assert.equal((await mergedAggregate(unnamed.directory, unnamed.outcome.stdout)).suite.subjectModel, 'runner default');
});

test('only a case whose case.yaml names a scaffold script runs with --scaffold', async () => {
  const withScript = `schema_version: "1.1"\nname: ${CASE}\ncontext:\n  scaffold_script: scaffold.sh\n`;
  const scaffolded = await runCase(['--mode', 'draft', '--arm', 'both'], {}, withScript);
  assert.equal(scaffolded.outcome.code, 0, scaffolded.outcome.stderr);
  assert.equal(scaffolded.calls.length, 2);
  assert.ok(scaffolded.calls.every((call) => call.includes('--scaffold')));
  const withReadGrantOnly = `schema_version: "1.1"\nname: ${CASE}\ncontext:\n  add_dirs:\n    - resources\n`;
  const readOnly = await runCase(['--mode', 'draft', '--arm', 'both'], {}, withReadGrantOnly);
  assert.ok(readOnly.calls.every((call) => !call.includes('--scaffold')));
  const plain = await runCase(['--mode', 'draft', '--arm', 'both']);
  assert.ok(plain.calls.every((call) => !call.includes('--scaffold')));
});
