import assert from 'node:assert/strict';
import test from 'node:test';
import { indexTags } from '../src/index.mjs';

test('indexTags maps each normalized tag to the ids that hold it', () => {
  const items = [{ id: 1, tags: ['A', 'a '] }, { id: 2, tags: ['a', 'B'] }];
  assert.deepEqual(indexTags(items), { a: [1, 2], b: [2] });
});
