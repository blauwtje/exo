import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedLiterals } from '../verify/checks/shared-literals.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const run = (files) => checkOutcome(checkSharedLiterals, createRepository(tree(files)));
const baseline = (count) => JSON.stringify([{ file: 'lib/other.mjs', literal: 15000, count, reason: 'other meaning' }]);

test('a typed-back 15000 fails', () => {
  const result = run({ 'lib/other.mjs': 'export const wait = 15000;\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/other\.mjs: 15000 \(SEARCH_FETCH_MS\)/);
});

test('a typed-back docs/specs fails', () => {
  const result = run({ 'skills/spec/scripts/x.mjs': "export const folder = 'docs/specs';\n" });
  assert.match(result.detail, /skills\/spec\/scripts\/x\.mjs: docs\/specs \(SPECS_FOLDER\)/);
});

test('a baseline literal within its count passes', () => {
  const result = run({ 'lib/other.mjs': 'export const wait = 15000;\n', 'verify/checks/shared-literals-baseline.json': baseline(1) });
  assert.equal(result.ok, true, result.detail);
});

test('a baseline literal over its count fails', () => {
  const result = run({ 'lib/other.mjs': 'const a = 15_000;\nconst b = 15000;\n', 'verify/checks/shared-literals-baseline.json': baseline(1) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/other\.mjs: 15000/);
});
