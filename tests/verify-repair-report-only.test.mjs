import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repair = fs.readFileSync(path.join(import.meta.dirname, '..', 'skills', 'verify', 'references', 'repair.md'), 'utf8');
const step4 = repair.match(/^4\. [^\n]*(?:\n(?!\d+\. )[^\n]*)*/m)[0];

test('a fix-diff review with only report findings goes on to the fix commit', () => {
  assert.match(step4, /`FINDINGS`[^\n]*`fix=0`[^\n]*step 5/);
});

test('a fix-diff review with a fix finding or BLOCKED ends the turn with fixes uncommitted', () => {
  assert.match(step4, /`fix=1` or more[^\n]*`BLOCKED`[^\n]*end the turn with its report, fixes uncommitted/);
});
