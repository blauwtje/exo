import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkModelRouting } from '../verify/checks/model-routing.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkModelRouting, createRepository(tree(files)));
}

test('a --model on one spawn does not hide a second claude -p spawn with none', () => {
  const source = [
    "spawn('claude', ['-p', '--model', 'sonnet', first]);",
    "spawn('claude', ['-p', second]);",
    ''
  ].join('\n');
  const result = run({ 'scripts/a.mjs': source });
  assert.equal(result.ok, false);
  assert.match(result.detail, /scripts\/a\.mjs:2 claude -p without --model/);
});
