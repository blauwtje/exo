// The restatement is built from skills/route-skills/SKILL.md every time it is
// sent, so the repository holds those rules once: a copy anywhere else would
// have to follow every edit of the skill, and would not.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RESTATED_HEADINGS, RESTATED_SKILL, restatementText } from '#restatement';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const SKILL_TEXT = fs.readFileSync(path.join(REPOSITORY, RESTATED_SKILL), 'utf8');
// Short lines, such as a table rule, say nothing a copy could be told by.
const SENTENCE_LENGTH = 60;

test('the restatement carries each named section whole and nothing else of the body', () => {
  const text = restatementText(SKILL_TEXT);
  for (const heading of RESTATED_HEADINGS) assert.ok(text.includes(`\n\n${heading}\n`), heading);
  assert.ok(text.trimEnd().endsWith('a reply of `1` carries out option 1 at once.'), 'the closing ends the text');
  assert.ok(!text.includes('## The ladder'));
  assert.ok(!text.includes('## The ending'));
  assert.deepEqual(text.match(/\n# .+/g), ['\n# Closing'], 'no level-one section but the closing');
});

test('a section ends at the next heading of its own level or above', () => {
  const skillText = ['# Top', '', '## Before acting', 'first', '### Deeper', 'kept', '', '## When several fire', 'second', '', '# Other', 'dropped', '', '# Closing', 'third', ''].join('\n');
  const sections = restatementText(skillText).split('\n\n').slice(1);
  assert.deepEqual(sections, ['## Before acting\nfirst\n### Deeper\nkept', '## When several fire\nsecond', '# Closing\nthird']);
});

test('a renamed heading throws and names it', () => {
  // Only the heading line is renamed, so the error has to name the heading it lost.
  const renamed = SKILL_TEXT.replace('\n## When several fire\n', '\n## Several fire\n');
  assert.throws(() => restatementText(renamed), /has no "## When several fire" heading/);
});

test('no tracked file but the skill holds a restated sentence', () => {
  const lines = restatementText(SKILL_TEXT).split('\n').slice(1);
  const sentences = lines.filter((line) => line.length >= SENTENCE_LENGTH);
  assert.ok(sentences.length >= 10, `${sentences.length} sentences`);
  for (const sentence of sentences) {
    const holders = execFileSync('git', ['grep', '-lF', '-e', sentence], { cwd: REPOSITORY, encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(holders, [RESTATED_SKILL], sentence);
  }
});
