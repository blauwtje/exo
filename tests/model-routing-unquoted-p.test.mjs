import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkModelRouting } from '../verify/checks/model-routing.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkModelRouting, createRepository(tree(files)));
}

test('a shell script that starts claude -p unquoted with no --model fails', () => {
  const result = run({ 'a.sh': 'claude -p "summarise"\n' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /a\.sh:1 claude -p without --model/);
});
