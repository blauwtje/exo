import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkImportDirection } from '../verify/checks/import-direction.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkImportDirection, createRepository(tree(files)));
}

test('a lib file importing a skill fails', () => {
  const result = run({ 'lib/a.mjs': "import { x } from '../skills/save/scripts/handoff.mjs';\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/a\.mjs:1/);
});

test('a skill importing another skill fails', () => {
  const result = run({ 'skills/save/scripts/a.mjs': "import { x } from '../../build/scripts/b.mjs';\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/save\/scripts\/a\.mjs:1/);
});

test('a file outside lib importing lib by a relative path fails', () => {
  const result = run({ 'skills/save/scripts/a.mjs': "const y = 1;\nimport { x } from '../../../lib/git.mjs';\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/save\/scripts\/a\.mjs:2/);
});

test('a lib file importing a lib sibling passes', () => {
  const result = run({ 'lib/a.mjs': "import { x } from './b.mjs';\n" });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkImportDirection, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
