import assert from 'node:assert/strict';
import test from 'node:test';
import { span } from '../src/span.mjs';

test('span is max minus min', () => {
  assert.equal(span([3, 9, 4]), 6);
});
