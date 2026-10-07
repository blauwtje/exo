// Hidden behavior tests for initials, copied beside the finished code by benchmarks/flow-check.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initials } from '../src/initials.js';

test('initials of a one-word name is one letter', () => {
  assert.equal(initials('ada'), 'A');
});

test('initials takes a letter from every word of a long name', () => {
  assert.equal(initials('Grace Brewster Murray Hopper'), 'GBMH');
});

test('initials splits on tabs and newlines', () => {
  assert.equal(initials('ada\tbyron\nlovelace'), 'ABL');
});

test('initials of a whitespace-only name is empty', () => {
  assert.equal(initials('   '), '');
});
