import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('build sends a builder chain to one builder with Chain: <k>', () => {
  const text = read('skills/build/SKILL.md');
  assert.match(text, /Route: builder chain <k>/);
  assert.match(text, /Chain: <k>/);
});

test('the builder prompt ends a chain with one status line per task', () => {
  const text = read('skills/build/references/run-task-prompt.md');
  assert.match(text, /Chain: <k>/);
  assert.match(text, /one status line per task/);
});
