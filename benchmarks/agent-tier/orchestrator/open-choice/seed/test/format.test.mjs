import assert from 'node:assert/strict';
import test from 'node:test';
import { padCents } from '../src/format.mjs';

test('padCents keeps two digits', () => {
  assert.equal(padCents(105), '05');
});
