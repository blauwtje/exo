import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the build skill holds no context or agent line', () => {
  const skill = fs.readFileSync(`${ROOT}skills/build/SKILL.md`, 'utf8');
  assert.doesNotMatch(skill, /^(context|agent):/m);
});

test('step 5 of the build skill dispatches build-task from the lead', () => {
  const skill = fs.readFileSync(`${ROOT}skills/build/SKILL.md`, 'utf8');
  assert.ok(skill.includes('exo:build-task') && !skill.includes('task-runner'));
});
