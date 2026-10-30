import assert from 'node:assert/strict';
import test from 'node:test';
import { titleCase } from '../src/text.mjs';

test('titleCase capitalises each word', () => {
  assert.equal(titleCase('hello big world'), 'Hello Big World');
});
