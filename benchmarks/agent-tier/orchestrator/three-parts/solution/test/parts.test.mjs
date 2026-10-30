import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp } from '../src/num.mjs';
import { slugify } from '../src/text.mjs';

test('slugify joins words with one dash', () => {
  assert.equal(slugify('  Hello, World!  '), 'hello-world');
});

test('clamp bounds the value and refuses an empty range', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.throws(() => clamp(1, 2, 0), RangeError);
});
