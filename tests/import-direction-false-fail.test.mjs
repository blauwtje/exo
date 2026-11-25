import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkImportDirection } from '../verify/checks/import-direction.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkImportDirection, createRepository(tree(files)));
}

test('a template string naming a lib path in a skill script passes', () => {
  const result = run({ 'skills/save/scripts/a.mjs': "const s = `import x from '../../../lib/git.mjs'`;\n" });
  assert.equal(result.ok, true, result.detail);
});

test('a comment naming a skill path in a lib file passes', () => {
  const result = run({ 'lib/a.mjs': "// moved from '../skills/save/x.mjs'\n" });
  assert.equal(result.ok, true, result.detail);
});
