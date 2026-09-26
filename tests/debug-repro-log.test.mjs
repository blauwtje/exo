// A linked worktree's `.git` is a file, not a directory, so a literal
// `.git/debug-repro.log` path fails there, and a path under the git directory
// lies outside the worktree. The skill resolves the log inside the checkout.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const SKILL = new URL('../skills/find-cause/SKILL.md', import.meta.url);

test('find-cause SKILL.md resolves the repro log path instead of naming .git literally', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(!source.includes('`.git/debug-repro.log`'), 'must not name .git/debug-repro.log literally');
  assert.ok(
    source.includes('`<scratch>/debug-repro.log`') && source.includes('lib/scratch-path.mjs" debug`'),
    'must resolve the repro log inside the checkout with scratch-path.mjs',
  );
});
