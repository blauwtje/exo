import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginate } from '../../src/lib/paginate.mjs';

const list = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('a partial last page counts as a page', () => {
  assert.equal(paginate(list(25), 1, 10).totalPages, 3);
  assert.equal(paginate(list(21), 1, 10).totalPages, 3);
  assert.equal(paginate(list(1), 1, 10).totalPages, 1);
});

test('the partial last page holds the remaining entries', () => {
  assert.deepEqual(paginate(list(25), 3, 10).items, [21, 22, 23, 24, 25]);
});

test('hasNext is true on the page before a partial last page', () => {
  assert.equal(paginate(list(25), 2, 10).hasNext, true);
});

test('hasNext is false on the last page, partial or full', () => {
  assert.equal(paginate(list(25), 3, 10).hasNext, false);
  assert.equal(paginate(list(30), 3, 10).hasNext, false);
});

test('a page size of one pages entry by entry', () => {
  const result = paginate(list(3), 2, 1);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(result.items, [2]);
  assert.equal(result.hasNext, true);
});

test('an empty list still has zero pages and nothing after it', () => {
  const result = paginate([], 1, 10);
  assert.equal(result.totalPages, 0);
  assert.equal(result.hasNext, false);
});

test('a page past the end is empty and has no next page', () => {
  const result = paginate(list(25), 9, 10);
  assert.deepEqual(result.items, []);
  assert.equal(result.hasNext, false);
});

test('an exact multiple keeps its page count', () => {
  assert.equal(paginate(list(20), 1, 10).totalPages, 2);
  assert.equal(paginate(list(20), 1, 5).totalPages, 4);
});
