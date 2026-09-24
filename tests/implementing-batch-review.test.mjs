// Step 7 of implementing-batch dispatches its fresh-eyes review from this
// prompt, so the dispatch text must actually run code-review or its
// fallback, write only the findings file, and never slip in a git write.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const PROMPT_PATH = new URL('../skills/implementing-batch/reviewer-prompt.md', import.meta.url);

function fencedBlock(source) {
  const match = source.match(/```text\n([\s\S]*?)\n```/);
  assert.ok(match, 'reviewer-prompt.md has a fenced text block');
  return match[1];
}

test('reviewer-prompt.md exists and dispatches a review delegate', () => {
  assert.ok(fs.existsSync(PROMPT_PATH), 'skills/implementing-batch/reviewer-prompt.md is missing');
  const source = fs.readFileSync(PROMPT_PATH, 'utf8');
  const block = fencedBlock(source);

  for (const needle of [
    'code-review',
    'references/critique.md',
    'batch-review.md',
    'verdict=CLEAN|FINDINGS|BLOCKED defect=<n> hazard=<n> report=<path>',
    'Write no file but the report',
  ]) {
    assert.ok(block.includes(needle), `fenced block missing: ${needle}`);
  }

  assert.ok(!block.includes('git commit'), 'the delegate must never be told to commit');
  assert.ok(!block.includes('Run:'), 'the delegate must not read a plan Run: line');
});

const SKILL_PATH = new URL('../skills/implementing-batch/SKILL.md', import.meta.url);

test('SKILL.md step 7 dispatches the reviewer prompt and names the fix scope', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8');
  const stepSeven = skill.match(/^7\. \*\*Fresh eyes\.\*\*.+$/m);
  assert.ok(stepSeven, 'SKILL.md has a step 7 line starting "7. **Fresh eyes.**"');
  const line = stepSeven[0];

  for (const needle of [
    'reviewer-prompt.md',
    'batch-review.md',
    'only its `file:start-end` range',
    'no separate context was available',
  ]) {
    assert.ok(line.includes(needle), `step 7 missing: ${needle}`);
  }

  assert.ok(
    /\|\s*`reviewer-prompt\.md`\s*\|/.test(skill),
    'References table has a reviewer-prompt.md row',
  );
});
