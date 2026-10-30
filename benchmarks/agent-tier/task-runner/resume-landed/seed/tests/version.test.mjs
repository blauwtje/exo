import assert from 'node:assert/strict';
import test from 'node:test';
import { VERSION } from '../src/version.mjs';

test('version is set', () => {
  assert.equal(VERSION, '1.0.0');
});
