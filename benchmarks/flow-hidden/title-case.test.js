// Hidden behavior tests for titleCase, copied beside the finished code by benchmarks/flow-check.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleCase } from '../src/title-case.js';

test('titleCase lowercases an all-caps word', () => {
  assert.equal(titleCase('HELLO'), 'Hello');
});

test('titleCase titles every word of a longer text', () => {
  assert.equal(titleCase('the qUICK brown FOX'), 'The Quick Brown Fox');
});

test('titleCase uppercases a one-letter word', () => {
  assert.equal(titleCase('a b c'), 'A B C');
});
