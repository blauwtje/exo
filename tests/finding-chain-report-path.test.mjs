import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the builder prompt tells a chain builder to take a later task report path from the Report: line', () => {
  const text = read('skills/build/references/run-task-prompt.md');
  const chain = text.split('\n').find((line) => line.includes('Chain: <k>'));
  assert.match(chain, /`Report:` line/);
  assert.doesNotMatch(chain, /scratch-path\.mjs/);
});

test('the builder prompt lists every report path on the Report: line of a chain', () => {
  const text = read('skills/build/references/run-task-prompt.md');
  assert.match(text, /Report:[^\n]*every report path|every report path[^\n]*Report:/);
});
