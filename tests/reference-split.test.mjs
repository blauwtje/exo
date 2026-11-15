import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkReferenceSplit } from '../verify/checks/reference-split.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkReferenceSplit, createRepository(tree(files)));
}

test('a skill naming its one-level reference passes', () => {
  const result = run({ 'skills/a/SKILL.md': 'Read references/format.md.\n', 'skills/a/references/format.md': 'Format.\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a reference the SKILL.md never names fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'Nothing.\n', 'skills/a/references/format.md': 'Format.\n' });
  assert.match(result.detail, /a: references\/format\.md is not named in SKILL\.md/);
});

test('a reference pointing to another reference fails', () => {
  const result = run({
    'skills/a/SKILL.md': 'Read references/one.md and references/two.md.\n',
    'skills/a/references/one.md': 'Then read references/two.md.\n',
    'skills/a/references/two.md': 'Two.\n'
  });
  assert.match(result.detail, /a: references\/one\.md points to another reference/);
});

test('a SKILL.md over 500 lines fails', () => {
  const result = run({ 'skills/a/SKILL.md': 'line\n'.repeat(501) });
  assert.match(result.detail, /a: SKILL\.md has 501 lines, over 500/);
});

test('a skill file pathing into another skill fails', () => {
  const result = run({
    'skills/a/SKILL.md': 'Run `node ../b/scripts/x.mjs`.\n',
    'skills/b/SKILL.md': 'Run exo:a.\n'
  });
  assert.match(result.detail, /skills\/a\/SKILL\.md names a path into another skill: '\.\.\/b\/scripts\/x\.mjs'/);
});
