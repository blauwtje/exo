import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkillSize } from '../scripts/checks/skill-size.mjs';
import { createRepository } from '../scripts/lib/repository.mjs';
import { REPOSITORY_ROOT } from './harness.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const lines = (count) => Array.from({ length: count }, (_, index) => `line ${index}`).join('\n');

function run(files) {
  return checkOutcome(checkSkillSize, createRepository(tree(files)));
}

test('a SKILL.md of 500 lines passes', () => {
  const result = run({ 'skills/a/SKILL.md': lines(500) });
  assert.equal(result.ok, true, result.detail);
});

test('a SKILL.md of 501 lines fails and names its count', () => {
  const result = run({ 'skills/a/SKILL.md': lines(501) });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/a\/SKILL\.md holds 501 lines/);
});

test('a reference file beside SKILL.md is allowed and not counted', () => {
  const result = run({ 'skills/a/SKILL.md': lines(400), 'skills/a/references/more.md': lines(400) });
  assert.equal(result.ok, true, result.detail);
});

test('a skill naming x.mjs fails, in a reference file too', () => {
  const result = run({ 'skills/a/SKILL.md': 'text', 'skills/a/references/more.md': 'run x.mjs now' });
  assert.match(result.detail, /skills\/a\/references\/more\.md names the script x\.mjs/);
});

test('a non-markdown file in a skill folder fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'text', 'skills/a/run.txt': 'text' });
  assert.match(result.detail, /skills\/a\/run\.txt is not a \.md file/);
});

test('the real repository passes', () => {
  const result = checkOutcome(checkSkillSize, createRepository(REPOSITORY_ROOT));
  assert.equal(result.ok, true, result.detail);
});
