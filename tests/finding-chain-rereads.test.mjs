import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const text = readFileSync(
  new URL('../skills/build/references/run-task-prompt.md', import.meta.url),
  'utf8',
);

test('the chain rule reads the plan once and uses the Brief: path for later tasks', () => {
  const chain = text.split('\n').find((line) => line.includes('Chain: <k>'));
  assert.match(chain, /Brief:/);
  assert.match(chain, /plan once|once/i);
});
