import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTags } from '../src/tags.mjs';

test('normalizeTags lowercases before it drops repeats', () => {
  assert.deepEqual(normalizeTags(['A', 'a ', ' B']), ['a', 'b']);
});
