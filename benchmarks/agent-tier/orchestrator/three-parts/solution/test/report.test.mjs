import assert from 'node:assert/strict';
import test from 'node:test';
import { report } from '../src/report.mjs';

test('report slugs the name and clamps the score', () => {
  assert.equal(report([{ name: 'Big Win!', score: 140 }, { name: 'b', score: -3 }]), 'big-win: 100\nb: 0');
});
