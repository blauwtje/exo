import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, run } from './harness.mjs';
import { setup, PLUGIN_ROOT, RUNNER } from './run-plan-fixture.mjs';

test('preflight: a second dry run on the same plan and HEAD skips plan-check', async () => {
  const context = await setup();
  const shims = await fixture();
  const count = path.join(shims, 'count.txt');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(shims, 'git'), `#!/bin/sh\ncase "$*" in *"ls-tree"*|*"merge-base"*) echo $PPID >> "${count}";; esac\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const env = { PATH: `${shims}${path.delimiter}${process.env.PATH}`, HOME: context.home, CLAUDECODE: '1' };
  const dry = () => run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, '--dry-run'], { cwd: context.root, env });
  const callsAfter = async () => (await fs.readFile(count, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  const first = await dry();
  assert.equal(first.code, 0, first.stdout);
  const afterFirst = await callsAfter();
  assert.ok(afterFirst >= 1, 'the first run ran plan-check');
  const second = await dry();
  assert.equal(second.code, 0, second.stdout);
  assert.equal(await callsAfter(), afterFirst, 'the second run ran plan-check again');
});

test('preflight: a changed plan-check script makes the next dry run run plan-check again', async () => {
  const context = await setup();
  const copy = path.join(await fixture(), 'plugin');
  const skipped = new Set(['.git', '.worktrees', '.exo', 'node_modules', 'tests', 'benchmarks', 'docs']);
  await fs.cp(PLUGIN_ROOT, copy, { recursive: true, filter: (source) => !skipped.has(path.relative(PLUGIN_ROOT, source)) });
  const runner = path.join(copy, 'skills', 'build', 'scripts', 'run-plan.mjs');
  const checker = path.join(copy, 'skills', 'spec', 'scripts', 'plan-check.mjs');
  const record = path.join(context.tools, 'plan-check-runs.txt');
  const env = { HOME: context.home, CLAUDECODE: '1' };
  const marker = `import { appendFileSync as markRun } from 'node:fs';\nmarkRun(${JSON.stringify(record)}, 'run\\n');\n`;
  const original = await fs.readFile(checker, 'utf8');
  const withMarker = original.startsWith('#!') ? original.replace(/^(#!.*\n)/, `$1${marker}`) : marker + original;
  await fs.writeFile(checker, withMarker);
  const dry = () => run(runner, [context.plan, '--root', context.root, '--claude', context.stub, '--dry-run'], { cwd: context.root, env });
  const runs = async () => (await fs.readFile(record, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  const first = await dry();
  assert.equal(first.code, 0, first.stdout + first.stderr);
  assert.equal(await runs(), 1, 'the first run ran plan-check');
  await fs.appendFile(checker, '\n// changed\n');
  const second = await dry();
  assert.equal(second.code, 0, second.stdout + second.stderr);
  assert.equal(await runs(), 2, 'the second run did not run plan-check after the script changed');
});
