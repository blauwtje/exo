import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewStages } from '../benchmarks/sweep-score.mjs';

test('reviewStages counts review dispatches and reads the first merged verdict', () => {
  const text = '{"content":"verdict=FINDINGS defect=0 concern=1 question=0 fix=0 report=/r.md\\nnone"}\n{"content":"verdict=FINDINGS defect=0 concern=2 question=0 fix=1 report=/r.md"}';
  const subagents = ['exo:build-task', 'exo:review-branch', 'exo:fix-review', 'exo:review-branch'];
  assert.deepEqual(reviewStages(subagents, text), { reviewBranch: 2, fixReview: 1, fix: 0, concern: 1 });
});

test('reviewStages leaves counts null without a FINDINGS verdict', () => {
  assert.deepEqual(reviewStages(['exo:review-branch'], 'verdict=CLEAN'), { reviewBranch: 1, fixReview: 0, fix: null, concern: null });
  assert.deepEqual(reviewStages(undefined, ''), { reviewBranch: 0, fixReview: 0, fix: null, concern: null });
});
