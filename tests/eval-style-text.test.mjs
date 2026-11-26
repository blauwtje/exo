import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLE_CASES = ['adhd-short-reply', 'reply-no-hashes'];

function styleBody() {
  const text = fs.readFileSync(path.join(root, 'output-styles', 'adhd.md'), 'utf8');
  return text.slice(text.indexOf('\n---\n', 4) + 5).trim();
}

function appendedPrompt(name) {
  const lines = fs.readFileSync(path.join(root, 'evals', name, 'prompt.md'), 'utf8').split('\n');
  const start = lines.indexOf('append_system_prompt: |');
  const end = lines.indexOf('---', 1);
  return lines.slice(start + 1, end).map((line) => line.replace(/^ {2}/, '')).join('\n').trim();
}

for (const name of STYLE_CASES) {
  test(`${name} appends the current text of the adhd output style`, () => {
    assert.equal(appendedPrompt(name), styleBody());
  });
}
