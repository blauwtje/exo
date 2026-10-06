import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModels } from '../src/registry.js';

test('loadModels loads the named model files', async () => {
  const models = await loadModels(['plan']);
  assert.deepEqual(Object.keys(models), ['PlanRecord']);
});
