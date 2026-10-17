import assert from 'node:assert/strict';
import test from 'node:test';
import { passDifference } from '../benchmarks/flow-report.mjs';

const arm = (passes, checked) => ({ passes, checked });

test('small pass-rate gaps read not better under Agresti-Caffo', () => {
  for (const [exo, baseline] of [[[1, 1], [0, 1]], [[2, 3], [0, 3]], [[3, 3], [1, 3]], [[3, 5], [0, 5]], [[4, 5], [1, 5]]]) {
    assert.equal(passDifference(arm(...exo), arm(...baseline)).better, false, `${exo.join('/')} vs ${baseline.join('/')}`);
  }
});

test('clear pass-rate gaps read better under Agresti-Caffo', () => {
  for (const [exo, baseline] of [[[3, 3], [0, 3]], [[4, 4], [0, 4]], [[5, 5], [0, 5]]]) {
    assert.equal(passDifference(arm(...exo), arm(...baseline)).better, true, `${exo.join('/')} vs ${baseline.join('/')}`);
  }
});

test('the observed and adjusted differences are both returned', () => {
  const result = passDifference(arm(3, 3), arm(0, 3));
  assert.equal(result.difference, 1);
  assert.ok(Math.abs(result.adjustedDifference - 0.6) < 1e-9);
});

test('an undefined baseline gives null', () => {
  assert.equal(passDifference(arm(1, 1), undefined), null);
});
