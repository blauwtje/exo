// A linked worktree's `.git` is a file, not a directory, so a literal
// `.git/debug-repro.log` path fails there. The skill must resolve the git
// directory at run time instead of naming it literally.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const SKILL = new URL('../skills/debug/SKILL.md', import.meta.url);

test('debug SKILL.md resolves the repro log path instead of naming .git literally', () => {
  const source = fs.readFileSync(SKILL, 'utf8');
  assert.ok(!source.includes('`.git/debug-repro.log`'), 'must not name .git/debug-repro.log literally');
  assert.ok(
    source.includes('$(git rev-parse --git-dir)/debug-repro.log'),
    'must resolve the git directory with git rev-parse --git-dir',
  );
});
