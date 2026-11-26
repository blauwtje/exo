import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkScratchKey } from '../verify/checks/scratch-key.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkScratchKey, createRepository(tree(files)));
}

test('a call with a call as first argument and a varying name fails', () => {
  const result = run({ 'lib/a.mjs': 'const f = scratchPath(process.cwd(), `implementer-${n}.md`);\n' });
  assert.equal(result.ok, false, 'scratchPath(process.cwd(), `implementer-${n}.md`) passed');
});

test('a call split over several lines with a varying name fails', () => {
  const result = run({ 'lib/a.mjs': 'const f = scratchPath(\n  root,\n  `x-${n}`\n);\n' });
  assert.equal(result.ok, false, 'multi-line scratchPath call passed');
});

test('a literal name followed by a plus later on the line passes', () => {
  const result = run({ 'lib/a.mjs': "const f = scratchPath(root, 'slot.env') + other;\n" });
  assert.equal(result.ok, true, result.detail);
});
