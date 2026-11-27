import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillSize } from '../verify/checks/skill-size.mjs';
import { createRepository } from '../verify/repository.mjs';
import { REPOSITORY_ROOT } from './harness.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const words = (count) => Array.from({ length: count }, (_, index) => `w${index}`).join(' ');

function run(files) {
  return checkOutcome(checkSkillSize, createRepository(tree(files)));
}

test('a skill of 500 words passes', () => {
  const result = run({ 'skills/a/SKILL.md': words(500) });
  assert.equal(result.ok, true, result.detail);
});

test('a skill of 501 words fails and names its count', () => {
  const result = run({ 'skills/a/SKILL.md': words(501) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /a holds 501 words/);
});

test('the words of every .md file in the folder add up', () => {
  const result = run({ 'skills/a/SKILL.md': words(300), 'skills/a/more.md': words(201) });
  assert.match(result.detail, /a holds 501 words/);
});

test('a skill naming x.mjs fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'run x.mjs now' });
  assert.match(result.detail, /skills\/a\/SKILL\.md names the script x\.mjs/);
});

test('a non-markdown file in a skill folder fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'text', 'skills/a/run.txt': 'text' });
  assert.match(result.detail, /skills\/a\/run\.txt is not a \.md file/);
});

test('the real repository passes', () => {
  const result = checkOutcome(checkSkillSize, createRepository(REPOSITORY_ROOT));
  assert.equal(result.ok, true, result.detail);
});
