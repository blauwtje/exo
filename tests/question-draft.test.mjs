// The question rule drafts more design routes than it shows, so the shown
// menu is a pick from a wider draft, not the first three to mind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_OPTIONS } from '../verify/checks/question-options.mjs';

const root = path.resolve(import.meta.dirname, '..');
const QUESTION = 'skills/route-skills/references/question.md';

test('question rule 4 drafts more design routes than the option cap and shows one not first to mind', () => {
  const text = fs.readFileSync(path.join(root, QUESTION), 'utf8');
  const rule = text.split('\n').find((line) => line.startsWith('4. '));
  assert.ok(rule, 'no rule 4');
  const draft = rule.match(/draft at least (\d+) routes/);
  assert.ok(draft, 'rule 4 sets no draft count');
  assert.ok(Number(draft[1]) > MAX_OPTIONS, `draft ${draft[1]} is not wider than ${MAX_OPTIONS} shown`);
  assert.match(rule, /not first to mind/, 'no shown route outside the first to mind');
});
