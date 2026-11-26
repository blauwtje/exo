import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as shared from '#shared-values';

const expected = {
  SEARCH_FETCH_MS: 15000,
  SEARCH_URL_BUDGET_MS: 45000,
  SEARCH_DEADLINE_MS: 240000,
  SEARCH_MAX_DEADLINE_MS: 290000,
  SEARCH_LOCK_MS: 60000,
  SEARCH_CHROME_START_MS: 10000,
  SEARCH_REDDIT_GAP_MS: 2000,
  RED_BASE_MARGIN_MS: 60000,
  SHIP_WAIT_MS: 1200000,
  SHIP_TIMEOUT_EXIT: 124,
  SELF_BUILD_TASKS: 3,
  CHAIN_TASKS: 4,
  SCRIPT_MAX_LINES: 400,
  SKILL_MAX_LINES: 500,
  PR_BODY_MAX_LINES: 40,
  LESSON_MAX_NOTES: 15,
  LESSON_MAX_LINES: 12,
  WATCH_LIST_LIMIT: 20,
  WATCH_BATCH_TOKENS: 40000,
  IDEAS_STRONG_SCORE: 16,
  SEARCH_TIERS: {
    quick: { workers: [1, 1], calls: 10, minutes: 2, pages: 5 },
    standard: { workers: [4, 5], calls: 15, minutes: 5, pages: 8 },
    deep: { workers: [8, 15], calls: 18, minutes: 15, runMinutes: 20, pages: 12 },
  },
  SPECS_FOLDER: 'docs/specs',
  RESEARCH_FOLDER: 'docs/research',
  DONE_FILE: 'docs/plans/definition-of-done.md',
  WORKTREES_FOLDER: '.claude/worktrees',
  PLAN_TASK_TRAILER: 'Plan-task',
  SPECS_SCRATCH: 'specs',
  SPEC_NOTES_SUFFIX: '-notes.md',
  WATCH_SCRATCH: 'watch',
  LEARN_SCRATCH: 'learn',
  RESEARCH_SCRATCH: 'research',
  STATUS_BLOCKED: 'BLOCKED',
  STATUS_PLAN_DRIFT: 'PLAN DRIFT',
  STATUS_NEEDS_ANSWER: 'NEEDS ANSWER',
  STATUS_RED_MISSING: 'did not fail first',
  SUCCESS_SECTION: 'Success criterion',
  ALLOWED_MODEL: ['sonnet', 'opus', 'haiku', 'fable', 'inherit'],
  ALLOWED_EFFORT: ['low', 'medium', 'high', 'xhigh', 'max'],
  CODE_LOOKUP_MODEL: 'haiku',
  CODE_LOOKUP_EFFORT: 'high',
  BRIEF_WRITER_MODEL: 'opus',
  BRIEF_WRITER_EFFORT: 'medium',
  RETRY_MODEL: 'opus',
  RETRY_EFFORT: 'high',
  SEARCH_PICK_MODEL: 'haiku',
  IDEAS_HELPER_MODEL: 'sonnet',
  IDEAS_HELPER_EFFORT: 'high',
};

test('the module exports exactly the shared values', () => {
  assert.deepEqual({ ...shared }, expected);
});

test('the module imports nothing', () => {
  const source = fs.readFileSync(new URL('../lib/shared-values.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b/);
});
