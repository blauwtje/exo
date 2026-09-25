// The audit-architecture audit dispatches a read-only delegate that writes ranked cards
// to a file instead of the session reading scoped code and writing cards itself.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROMPT = path.join(ROOT, 'skills/audit-architecture/auditor-prompt.md');
const SKILL = path.join(ROOT, 'skills/audit-architecture/SKILL.md');

test('auditor-prompt.md carries the cards-file contract', () => {
  const text = fs.readFileSync(PROMPT, 'utf8');
  assert.match(text, /exo\/deepen\//);
  assert.match(text, /cards=/);
  assert.match(text, /at most 5 cards/);
  for (const field of ['Files:', 'Friction:', 'Refactor:', 'Payoff:', 'Confidence:', 'Migration cost:']) {
    assert.ok(text.includes(field), `auditor-prompt.md is missing the field ${field}`);
  }
});

test('SKILL.md dispatches the delegate instead of reading scoped code itself', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  assert.match(text, /scripts\/hotspots\.mjs/);
  assert.match(text, /auditor-prompt\.md/);
  assert.match(text, /every other planning turn belongs to/);
  assert.ok(!text.includes('Read the scoped code'), 'SKILL.md still reads the scoped code itself');
  assert.ok(!text.includes('commit history keeps coming back'), 'SKILL.md still has locate-code computing churn');
});
