import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../skills/ship/SKILL.md', import.meta.url), 'utf8');

test('ship skill names no bare npm run check', () => {
  const bare = text.split('\n').filter((line) => line.includes('npm run check') && !/for example|e\.g\./i.test(line));
  assert.deepEqual(bare, []);
});

test('ship skill points to the project check source', () => {
  assert.match(text, /CLAUDE\.md/);
  assert.match(text, /\bCI\b/);
});
