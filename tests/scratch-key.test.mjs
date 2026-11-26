import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkScratchKey } from '../verify/checks/scratch-key.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkScratchKey, createRepository(tree(files)));
}

test('a template name with an interpolation fails', () => {
  const result = run({ 'lib/a.mjs': 'const f = scratchPath(root, `implementer-${n}.md`);\n' });
  assert.match(result.detail, /scratch key: lib\/a\.mjs:1 passes a varying name to scratchPath; use taskScratchPath or allowlist it with its scope/);
});

test('a concatenated name fails', () => {
  const result = run({ 'skills/build/scripts/a.mjs': "const f = scratchPath(root, 'brief-' + n);\n" });
  assert.match(result.detail, /skills\/build\/scripts\/a\.mjs:1/);
});

test('a literal name passes', () => {
  const result = run({ 'lib/a.mjs': "const f = scratchPath(root, 'slot.env');\n" });
  assert.equal(result.ok, true, result.detail);
});

test('taskScratchPath passes', () => {
  const result = run({ 'lib/a.mjs': 'const f = taskScratchPath(state, task, `brief-${n}.md`);\n' });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkScratchKey, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
