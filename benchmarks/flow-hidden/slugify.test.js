// Hidden behavior tests for slugify, copied beside the finished code by benchmarks/flow-check.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slugify } from '../src/slugify.js';

test('slugify keeps digits', () => {
  assert.equal(slugify('Route 66'), 'route-66');
});

test('slugify turns a run of punctuation and spaces into one dash', () => {
  assert.equal(slugify('a -- b __ c'), 'a-b-c');
});

test('slugify leaves no dash at either end', () => {
  assert.equal(slugify('--Hello--'), 'hello');
});

test('slugify returns an empty string when no letter or digit is left', () => {
  assert.equal(slugify('!!! ???'), '');
});

test('slugify lowercases a text that is already a slug', () => {
  assert.equal(slugify('Already-Slugged'), 'already-slugged');
});
