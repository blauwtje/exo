import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkModelRouting } from '../verify/checks/model-routing.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkModelRouting, createRepository(tree(files)));
}

test('a script that runs mkdir -p and mentions a .claude path passes', () => {
  const result = run({ 'scripts/a.mjs': "const dir = '.claude/cache';\nspawnSync('mkdir', ['-p', dir]);\n" });
  assert.equal(result.ok, true, result.detail);
});
