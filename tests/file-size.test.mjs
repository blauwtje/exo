import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkFileSize } from '../verify/checks/file-size.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const body = (count) => `${'const a = 1;\n'.repeat(count)}`;

function run(files) {
  return checkOutcome(checkFileSize, createRepository(tree(files)));
}

test('a 401-line lib file fails and names its length', () => {
  const result = run({ 'lib/big.mjs': body(401) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lib\/big\.mjs \(401 lines\)/);
});

test('a 401-line skill script and verify file fail and are named', () => {
  const result = run({ 'skills/x/scripts/a.mjs': body(401), 'verify/a.mjs': body(401) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/x\/scripts\/a\.mjs \(401 lines\)/);
  assert.match(result.detail, /verify\/a\.mjs \(401 lines\)/);
});

test('a 400-line file passes', () => {
  const result = run({ 'lib/ok.mjs': body(400) });
  assert.equal(result.ok, true, result.detail);
});

test('a 900-line tests file passes', () => {
  const result = run({ 'tests/long.test.mjs': body(900) });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkFileSize, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
