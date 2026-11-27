import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkUnusedExports } from '../scripts/checks/unused-exports.mjs';
import { createRepository } from '../scripts/lib/repository.mjs';
import { REPOSITORY_ROOT } from './harness.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const run = (files) => checkOutcome(checkUnusedExports, createRepository(tree(files)));
const PRODUCER = { 'scripts/a.mjs': 'export const a = 1;\n' };

test('an export no other file imports fails and is named', () => {
  const result = run({ ...PRODUCER, 'scripts/b.mjs': 'export const b = 2;\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /scripts\/a\.mjs exports a,/);
});

test('an import by name passes', () => {
  const result = run({ ...PRODUCER, 'scripts/main.mjs': "import { a } from './a.mjs';\nconsole.log(a);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('an import with as passes', () => {
  const result = run({ ...PRODUCER, 'scripts/main.mjs': "import { a as b } from './a.mjs';\nconsole.log(b);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('an import with * as passes', () => {
  const result = run({ ...PRODUCER, 'scripts/main.mjs': "import * as all from './a.mjs';\nconsole.log(all);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('an import through a package.json alias passes', () => {
  const result = run({
    ...PRODUCER,
    'package.json': JSON.stringify({ imports: { '#a': './scripts/a.mjs' } }),
    'scripts/main.mjs': "import { a } from '#a';\nconsole.log(a);\n"
  });
  assert.equal(result.ok, true, result.detail);
});

test('an import from a test file does not count for an export outside tests', () => {
  const result = run({ ...PRODUCER, 'tests/a.test.mjs': "import { a } from '../scripts/a.mjs';\nconsole.log(a);\n" });
  assert.equal(result.ok, false);
  assert.match(result.detail, /scripts\/a\.mjs exports a,/);
});

test('an import from a test file counts for a test helper', () => {
  const result = run({ 'tests/helper.mjs': 'export const h = 1;\n', 'tests/a.test.mjs': "import { h } from './helper.mjs';\nconsole.log(h);\n" });
  assert.equal(result.ok, true, result.detail);
});

test('an export in another form fails', () => {
  const result = run({ 'scripts/a.mjs': 'const a = 1;\nexport { a };\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /scripts\/a\.mjs:2 uses an export form/);
});

test('the real repository passes', () => {
  const result = checkOutcome(checkUnusedExports, createRepository(REPOSITORY_ROOT));
  assert.equal(result.ok, true, result.detail);
});
