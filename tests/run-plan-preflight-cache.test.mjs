import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, run } from './harness.mjs';
import { setup, RUNNER } from './run-plan-fixture.mjs';

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
