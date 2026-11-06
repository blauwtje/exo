import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const skill = fs.readFileSync('skills/save-session/SKILL.md', 'utf8');
const template = fs.readFileSync('skills/save-session/assets/handoff-template.md', 'utf8');

function resumeParagraph() {
  return skill.match(/## Resume\n[\s\S]*?```text\n([\s\S]*?)\n```/)[1];
}

test('the Resume line instruction holds no example in a fixed language', () => {
  const line = skill.split('\n').find((text) => text.startsWith('The last line of the file'));
  assert.ok(line.includes("in the user's language"));
  assert.doesNotMatch(line, /\blees\b|\bga verder\b/);
});

test('the fixed Resume paragraph names no section the handoff may leave out', () => {
  const optional = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]).filter((name) => name !== 'Resume');
  const named = optional.filter((name) => resumeParagraph().includes(`## ${name}`));
  assert.deepEqual(named, []);
});
