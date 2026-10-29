import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const QUESTION = 'skills/route-skills/references/question.md';
const text = fs.readFileSync(path.join(root, QUESTION), 'utf8');

test('question.md opens with a When to ask gate before the shape', () => {
  const headings = text.split('\n').filter((line) => line.startsWith('## '));
  assert.equal(headings[0], '## When to ask');
  const gate = text.split('## When to ask')[1].split('\n## ')[0];
  assert.match(gate, /only the user/);
  assert.match(gate, /everyday words/);
  assert.match(gate, /costly to undo/);
});

test('question rule 4 has no route draft and the example title has no progress counter', () => {
  const rule = text.split('\n').find((line) => line.startsWith('4. '));
  assert.ok(rule, 'no rule 4');
  assert.doesNotMatch(rule, /draft|routes|first to mind/);
  assert.doesNotMatch(text, /\*\*\d+\/\d+ /);
});

test('When to ask sends a safe-default choice to the Decided for you list and keeps the three asking cases', () => {
  const gate = text.split('## When to ask')[1].split('\n## ')[0];
  assert.match(gate, /\*\*Decided for you\*\*/);
  assert.match(gate, /irreversible/);
  assert.match(gate, /no safe default/);
  assert.match(gate, /account or eyes/);
});
