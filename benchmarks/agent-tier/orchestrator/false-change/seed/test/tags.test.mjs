import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTags } from '../src/tags.mjs';

test('normalizeTags trims each tag', () => {
  assert.deepEqual(normalizeTags([' a', 'b ']), ['a', 'b']);
});

test('normalizeTags drops a repeated tag', () => {
  assert.deepEqual(normalizeTags(['a', ' a']), ['a']);
});
