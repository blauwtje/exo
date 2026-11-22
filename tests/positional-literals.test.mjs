import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPositionalLiterals } from '../verify/checks/positional-literals.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const price = ['costs $', '1'].join('');

function run(files) {
  return checkOutcome(checkPositionalLiterals, createRepository(tree(files)));
}

test('a skill file with a positional literal fails with its path and line', () => {
  const result = run({ 'skills/a/SKILL.md': `one\n${price}\n` });
  assert.equal(result.ok, false);
  assert.match(result.detail, /skills\/a\/SKILL\.md:2/);
});

test('an agent file with a positional literal fails', () => {
  const result = run({ 'agents/b.md': price });
  assert.match(result.detail, /agents\/b\.md:1/);
});

test('a file outside the three folders passes', () => {
  const result = run({ 'docs/a.md': price, 'skills/a/script.mjs': price });
  assert.equal(result.ok, true, result.detail);
});

test('a skill file without a literal passes', () => {
  const result = run({ 'skills/a/SKILL.md': 'costs $USD and ${HOME}\n' });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkPositionalLiterals, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
