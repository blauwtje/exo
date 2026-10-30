import assert from 'node:assert/strict';
import test from 'node:test';
import { report } from '../src/report.mjs';

test('report prints one line per item', () => {
  assert.equal(report([{ name: 'a', score: 1 }, { name: 'b', score: 2 }]), 'a: 1\nb: 2');
});
