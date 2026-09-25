// Every reply, report and question follows the language of the user's latest
// message, or the plan's language when a session opens on a plan. The model
// follows this by reading route-skills, so this test guards the text that states it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const USING_EXO = fs.readFileSync(new URL('../skills/route-skills/SKILL.md', import.meta.url), 'utf8');

test('route-skills states one reply-language rule for every reply, report and question', () => {
  const rule = USING_EXO.match(/^- \*\*Language\.\*\* .+$/m);
  assert.ok(rule, 'the Language bullet exists');
  assert.ok(rule[0].includes("in the language of the user's latest message"));
  assert.ok(rule[0].includes("writes in the plan's language"));
});

test('the question options point at the reply-language rule instead of stating their own', () => {
  const question = fs.readFileSync(new URL('../skills/route-skills/references/question.md', import.meta.url), 'utf8');
  assert.ok(question.includes('as the language rule under `# Context` in route-skills sets'));
  assert.ok(!question.includes("are in the conversation's language"));
  assert.ok(!USING_EXO.includes("are in the conversation's language"));
});
