import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginate } from '../src/lib/paginate.mjs';

const twenty = Array.from({ length: 20 }, (_, i) => i + 1);

test('returns the entries of the requested page', () => {
  assert.deepEqual(paginate(twenty, 2, 5).items, [6, 7, 8, 9, 10]);
});

test('defaults to the first page of ten', () => {
  const result = paginate(twenty);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 10);
  assert.equal(result.items.length, 10);
});

test('an exact multiple fills every page', () => {
  const result = paginate(twenty, 1, 10);
  assert.equal(result.totalPages, 2);
  assert.equal(result.hasNext, true);
  assert.equal(paginate(twenty, 2, 10).hasNext, false);
});

test('an empty list has no pages', () => {
  const result = paginate([], 1, 10);
  assert.deepEqual(result.items, []);
  assert.equal(result.totalPages, 0);
  assert.equal(result.hasNext, false);
});

test('a page past the end is empty', () => {
  assert.deepEqual(paginate(twenty, 5, 10).items, []);
});
