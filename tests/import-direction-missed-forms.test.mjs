import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkImportDirection } from '../verify/checks/import-direction.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkImportDirection, createRepository(tree(files)));
}

test('a lib file with a dynamic import of a skill fails', () => {
  const result = run({ 'lib/a.mjs': "const y = await import('../skills/a/scripts/y.mjs');\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/a\.mjs:1/);
});

test('a skill script with a side-effect import of lib fails', () => {
  const result = run({ 'skills/save/scripts/a.mjs': "import '../../../lib/git.mjs';\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/save\/scripts\/a\.mjs:1/);
});

test('a skill import with no space after from fails', () => {
  const result = run({ 'skills/save/scripts/a.mjs': "import { x } from'../../../lib/git.mjs';\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/save\/scripts\/a\.mjs:1/);
});
