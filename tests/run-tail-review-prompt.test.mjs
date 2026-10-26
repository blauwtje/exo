import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPrompt } from '../skills/build/scripts/run-tail.mjs';

const prompt = reviewPrompt({
  planPath: '/work/plan.md',
  root: '/work/checkout',
  base: 'abc123',
  branch: 'feature',
  scope: 'branch abc123..HEAD',
  findings: '/work/checkout/.exo/review-branch.md'
});

test('the headless review prompt gives no implementer report directory', () => {
  assert.doesNotMatch(prompt, /report directory/i);
  assert.doesNotMatch(prompt, /\/work\/checkout\/\.exo\/(?!review-branch\.md)/);
});

test('the headless review prompt still lists plan, branch, checkout, base, scope and findings path', () => {
  for (const line of ['- Plan: /work/plan.md', '- Branch: feature', '- Checkout: /work/checkout', '- Base: abc123', '- Scope: branch abc123..HEAD', '- Findings path: /work/checkout/.exo/review-branch.md']) {
    assert.ok(prompt.includes(line), line);
  }
});
