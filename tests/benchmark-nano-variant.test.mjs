import assert from 'node:assert/strict';
import test from 'node:test';
import { ARMS, DEFAULT_ARMS } from '../benchmarks/tasks.mjs';
import { VARIANTS, checkVariant } from '../benchmarks/variants.mjs';

test('the nano variant removes the hook registry and the orchestrator', () => {
  assert.deepEqual(VARIANTS.nano.remove, ['hooks/hooks.json', 'agents/orchestrator.md']);
  assert.deepEqual([VARIANTS.nano.edits, VARIANTS.nano.swap], [[], []]);
});

test('the exo-nano arm loads the nano variant and stays out of the default arms', () => {
  assert.equal(ARMS['exo-nano'].variant, 'nano');
  assert.equal(DEFAULT_ARMS.includes('exo-nano'), false);
});

test('the nano variant builds with nothing wrong', () => {
  assert.deepEqual(checkVariant('nano'), []);
});

test('a variant that loses the hook registry without declaring it fails the check', () => {
  const saved = VARIANTS.nano.remove;
  class Undeclared extends Array {
    includes() {
      return false;
    }
  }
  VARIANTS.nano.remove = Undeclared.from(saved);
  const problems = checkVariant('nano');
  VARIANTS.nano.remove = saved;
  assert.ok(problems.some((problem) => problem.includes('hooks/hooks.json is missing')));
});
