// Every reply, report and question follows the language of the user's latest
// message, or the plan's language when a session opens on a plan. The model
// follows this by reading using-exo, so this test guards the text that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const USING_EXO = fs.readFileSync(new URL('../skills/using-exo/SKILL.md', import.meta.url), 'utf8');

test('using-exo states one reply-language rule for every reply, report and question', () => {
  const rule = USING_EXO.match(/^- \*\*Language\.\*\* .+$/m);
  assert.ok(rule, 'the Language bullet exists');
  assert.ok(rule[0].includes("in the language of the user's latest message"));
  assert.ok(rule[0].includes("writes in the plan's language"));
});

test('the question options point at the reply-language rule instead of stating their own', () => {
  assert.ok(USING_EXO.includes('as the language rule under `# Context` sets'));
  assert.ok(!USING_EXO.includes("are in the conversation's language"));
});
