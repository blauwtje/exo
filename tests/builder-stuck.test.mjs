import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('builder stops with BLOCKED stuck and the diff state', () => {
  const text = read('agents/builder.md');
  assert.match(text, /BLOCKED stuck: <command> <result>/);
  assert.match(text, /git status --short/);
});

test('build routes a builder that returns no status line', () => {
  assert.match(read('skills/build/SKILL.md'), /returns no status line/);
});
