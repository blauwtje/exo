import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedLiterals } from '../verify/checks/shared-literals.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tree } from './check-outcome.mjs';

const values = "export const SEARCH_FETCH_MS = 15000;\nexport const SPECS_FOLDER = 'docs/specs';\n";
const run = async (files) => {
  const repository = createRepository(tree({ 'lib/shared-values.mjs': values, ...files }));
  const results = [];
  await checkSharedLiterals({ assert: (ok, name, details) => results.push({ ok, detail: ok ? details.pass : details.fail }) }, repository);
  return results[0];
};
const baseline = (count) => JSON.stringify([{ file: 'lib/other.mjs', literal: 15000, count, reason: 'other meaning' }]);

test('a typed-back 15000 fails', async () => {
  const result = await run({ 'lib/other.mjs': 'export const wait = 15000;\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/other\.mjs: 15000 \(SEARCH_FETCH_MS\)/);
});

test('a typed-back docs/specs fails', async () => {
  const result = await run({ 'skills/spec/scripts/x.mjs': "export const folder = 'docs/specs';\n" });
  assert.match(result.detail, /skills\/spec\/scripts\/x\.mjs: docs\/specs \(SPECS_FOLDER\)/);
});

test('a baseline literal within its count passes', async () => {
  const result = await run({ 'lib/other.mjs': 'export const wait = 15000;\n', 'verify/checks/shared-literals-baseline.json': baseline(1) });
  assert.equal(result.ok, true, result.detail);
});

test('a baseline literal over its count fails', async () => {
  const result = await run({ 'lib/other.mjs': 'const a = 15_000;\nconst b = 15000;\n', 'verify/checks/shared-literals-baseline.json': baseline(1) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/other\.mjs: 15000/);
});

test('a number inside a longer name or number passes', async () => {
  const result = await run({ 'lib/other.mjs': 'const x15000y = 1;\nconst big = 115000;\nconst d = 1.15000;\n' });
  assert.equal(result.ok, true, result.detail);
});

test('shared values come from the module under the given root', async () => {
  const result = await run({
    'lib/shared-values.mjs': 'export const OTHER_MS = 77777;\n',
    'lib/other.mjs': 'export const wait = 77777;\n'
  });
  assert.match(result.detail, /lib\/other\.mjs: 77777 \(OTHER_MS\)/);
});
