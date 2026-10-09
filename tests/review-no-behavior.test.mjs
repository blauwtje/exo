// A finding whose repair changes no behavior must be marked report, or the fix
// commit blocks on it and another review round starts for nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const agent = fs.readFileSync(fileURLToPath(new URL('../agents/review-branch.md', import.meta.url)), 'utf8');
const review = agent.split('## Review')[1].split('## Boundaries')[0];

test('review-branch marks a no-behavior repair report, never fix', () => {
  const line = review.split('\n').find((l) => /changes no output/.test(l) && /placement/.test(l));
  assert.ok(line, 'rule line missing in ## Review');
  assert.match(line, /`report`/);
  assert.match(line, /never `fix`/);
});
