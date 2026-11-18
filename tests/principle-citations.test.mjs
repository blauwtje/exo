import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPrincipleCitations } from '../verify/checks/principle-citations.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkPrincipleCitations, createRepository(tree(files)));
}

test('a cited path that exists passes, with a line suffix stripped', () => {
  const result = run({ 'principles/a.md': '- rule. exo: `skills/x.md:12-14`\n', 'skills/x.md': '' });
  assert.equal(result.ok, true, result.detail);
});

test('a cited path that is missing fails', () => {
  const result = run({ 'principles/a.md': '- rule. exo: `skills/gone.md`\n' });
  assert.match(result.detail, /principles\/a\.md cites skills\/gone\.md/);
});

test('a skill name and a command with spaces are not paths', () => {
  const result = run({ 'principles/a.md': '- rule. exo: `exo:build` and `git diff --stat`\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a missing path fails when a backticked skill name comes before the citation marker', () => {
  const result = run({ 'principles/a.md': '- **Run `exo:spec` first.** [1] exo: `skills/gone.md`\n' });
  assert.match(result.detail, /principles\/a\.md cites skills\/gone\.md/);
});

test('the shipped principle pages pass', () => {
  const result = checkOutcome(checkPrincipleCitations, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
