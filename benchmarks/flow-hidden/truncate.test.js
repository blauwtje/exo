// Hidden behavior tests for truncate, copied beside the finished code by benchmarks/flow-check.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { truncate } from '../src/truncate.js';

test('truncate leaves a text of exactly max characters whole', () => {
  assert.equal(truncate('hello', 5), 'hello');
});

test('truncate cuts a text one character over max', () => {
  assert.equal(truncate('abcdefghij', 9), 'abcdef...');
});

test('truncate returns exactly max characters when it cuts', () => {
  const cut = truncate('the quick brown fox jumps', 12);
  assert.equal(cut.length, 12);
  assert.equal(cut, 'the quick...');
});

test('truncate returns only the dots when max is 3', () => {
  assert.equal(truncate('hello', 3), '...');
});

test('truncate leaves an empty text empty', () => {
  assert.equal(truncate('', 5), '');
});
