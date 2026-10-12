// run-plan.mjs refuses a Success criterion that also passes on the run's start commit.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, run } from './harness.mjs';
import { setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const land = (number) => ({ commits: [{ file: number === 1 ? 'a.txt' : 'b.txt', trailers: [`Plan-task: plan/${number}`] }] });

async function runPlan(context, steps) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home }
  });
  const text = await fs.readFile(record, 'utf8').catch(() => '');
  const calls = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const logDir = result.stdout.match(/^Details: (.+)\/summary\.txt$/m)?.[1];
  const detail = logDir === undefined ? '' : await fs.readFile(path.join(logDir, 'summary.txt'), 'utf8');
  const progress = logDir === undefined ? '' : await fs.readFile(path.join(logDir, 'progress.md'), 'utf8');
  return { ...result, calls, detail, progress, logDir };
}

test('a Success that passes on the start commit gets one repair session, then stops the run', async () => {
  const context = await setup({ successRed: null });
  const result = await runPlan(context, [land(1), land(2), { result: 'Nothing to change.' }]);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.calls.length, 3, 'two task sessions and one repair session, no review tail');
  assert.match(result.calls[2].stdin, /also passes on [0-9a-f]{7,}/);
  assert.match(result.detail, /^Red-green: no-red: the command also passes on /m);
  assert.match(result.detail, /^run-plan: stop: red-green: no-red/m);
  const start = await fs.readFile(path.join(context.root, '.exo', 'run-plan', 'plan', 'start-commit'), 'utf8').catch(() => null);
  assert.equal(start?.trim(), git(context.root, 'rev-parse', 'main').trim());
});

test('a Success that fails on the start commit is proved and the review tail runs', async () => {
  const context = await setup({ success: '`test -f b.txt`', successRed: null });
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.match(result.detail, /^Red-green: proved$/m, result.stdout + result.stderr);
  assert.match(result.progress, /final review start/);
  assert.ok(result.calls.every((call) => !/also passes on/.test(call.stdin)));
});

test('Red: none on the Success criterion skips the gate and logs it', async () => {
  const context = await setup({ successRed: 'Red: none (docs)' });
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.match(result.detail, /^Red-green: skipped \(Red: none \(docs\)\)$/m, result.stdout + result.stderr);
  assert.match(result.progress, /^- \[\d\d:\d\d\] Red-green: skipped \(Red: none \(docs\)\)$/m);
});

test('the red-green skip and outcome lines reach stdout, which exo run keeps as run.log', async () => {
  const skipped = await runPlan(await setup({ successRed: 'Red: none (docs)' }), [land(1), land(2), { result: 'Verify done.' }]);
  assert.match(skipped.stdout, /^\[\d\d:\d\d\] Red-green: skipped \(Red: none \(docs\)\)$/m, skipped.stdout + skipped.stderr);
  const proved = await runPlan(await setup({ success: '`test -f b.txt`', successRed: null }), [land(1), land(2), { result: 'Verify done.' }]);
  assert.match(proved.stdout, /^\[\d\d:\d\d\] Red-green: proved$/m, proved.stdout + proved.stderr);
});

test('a resume with tasks landed and no start-commit file skips the gate, not a HEAD base', async () => {
  const context = await setup({ success: '`test -f b.txt`', successRed: null });
  for (const [number, file] of [[1, 'a.txt'], [2, 'b.txt']]) {
    await fs.writeFile(path.join(context.root, file), `${number}\n`);
    git(context.root, 'add', file);
    git(context.root, 'commit', '-q', '-m', `feat: task ${number}`, '-m', `Plan-task: plan/${number}`);
  }
  const result = await runPlan(context, [{ result: 'Verify done.' }]);
  const line = "Red-green: skipped (the run's start commit is unknown: tasks landed before start-commit was recorded)";
  assert.ok(result.detail.split('\n').includes(line), result.stdout + result.stderr);
  assert.ok(result.progress.includes(`] ${line}\n`));
  assert.ok(result.stdout.includes(`] ${line}\n`));
  assert.match(result.progress, /final review start/);
  assert.ok(result.calls.every((call) => !/also passes on/.test(call.stdin)));
  const start = await fs.readFile(path.join(context.root, '.exo', 'run-plan', 'plan', 'start-commit'), 'utf8').catch(() => null);
  assert.equal(start, null, 'no HEAD recorded as the start commit');
});
