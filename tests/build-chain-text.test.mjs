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

test('no build text tells anyone to run scratch-path.mjs for an implementer report path', () => {
  for (const file of ['skills/build/SKILL.md', 'skills/build/references/run-task-prompt.md']) {
    const line = read(file).split('\n').find((text) => /scratch-path\.mjs.*implementer-/.test(text));
    assert.equal(line, undefined, file);
  }
});
