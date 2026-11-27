import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proofCommandOf } from '../skills/build/scripts/land-report.mjs';

test('a leading Ran: line is not read as the proof command', () => {
  const task = { number: 1, proof: null };
  const report = 'Ran: sonnet, high\nnode tests/app.test.mjs: pass\nLanded: yes\n';
  assert.equal(proofCommandOf(task, report, 'report.md'), 'node tests/app.test.mjs');
});
