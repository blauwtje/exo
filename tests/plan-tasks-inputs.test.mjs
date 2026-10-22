import assert from 'node:assert/strict';
import test from 'node:test';
import { relativeInputPaths } from '../lib/plan-tasks.mjs';

test('a relative input under a dot folder is an input', () => {
  const frame = { assumptions: ['- assume: the hint is `.exo/carry/task1-partial.patch`'], context: [] };
  assert.deepEqual(relativeInputPaths(frame), ['.exo/carry/task1-partial.patch']);
});

test('a parent path is not an input', () => {
  assert.deepEqual(relativeInputPaths({ assumptions: ['- assume: `../x/y.md`'], context: [] }), []);
});
