import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as variantsDepth from '../benchmarks/variants-depth.mjs';
import { noForkProblems } from '../benchmarks/variants-depth.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the build skill holds no context or agent line', () => {
  assert.deepEqual(noForkProblems(ROOT), []);
});

test('step 5 of the run loop still dispatches the task runner', () => {
  const loop = fs.readFileSync(`${ROOT}skills/build/references/run-loop.md`, 'utf8');
  assert.ok(loop.includes('exo:task-runner'));
});

test('the unused no-fork edit is gone and the task runner agent stays', () => {
  assert.equal('NO_FORK_EDIT' in variantsDepth, false);
  assert.ok(fs.existsSync(`${ROOT}agents/task-runner.md`));
});
