import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TABLE_PATH, readKindTable } from '../lib/model-kinds.mjs';

test('the claude deep tier defaults to opus and takes the deep option', () => {
  assert.equal(readKindTable(TABLE_PATH, { provider: 'claude' }).providers.claude.tiers.deep, 'opus');
  assert.equal(readKindTable(TABLE_PATH, { provider: 'claude', deep: 'fable' }).providers.claude.tiers.deep, 'fable');
});

test('the deep option leaves codex and deepseek tiers alone', () => {
  const codex = readKindTable(TABLE_PATH, { provider: 'codex', deep: 'fable' });
  assert.equal(codex.kinds.hardest.model, 'gpt-6.1-sol');
  const deepseek = readKindTable(TABLE_PATH, { provider: 'deepseek', deep: 'fable' });
  assert.equal(deepseek.kinds.hardest.model, 'inherit');
});

const DEEP_KINDS = ['hardest', 'review-deep', 'orchestrator'];

test('deep opus gives the strong model on the three deep kinds', () => {
  const { kinds } = readKindTable(TABLE_PATH, { provider: 'claude', deep: 'opus' });
  for (const name of DEEP_KINDS) assert.equal(kinds[name].model, 'opus', name);
});

test('deep fable changes exactly the model of the three deep kinds', () => {
  const opus = readKindTable(TABLE_PATH, { provider: 'claude', deep: 'opus' }).kinds;
  const fable = readKindTable(TABLE_PATH, { provider: 'claude', deep: 'fable' }).kinds;
  for (const [name, pair] of Object.entries(opus)) {
    const expected = DEEP_KINDS.includes(name) ? { ...pair, model: 'fable' } : pair;
    assert.deepEqual(fable[name], expected, name);
  }
});

test('deep fable changes no deepseek kind', () => {
  const base = readKindTable(TABLE_PATH, { provider: 'deepseek', deep: 'opus' }).kinds;
  assert.deepEqual(readKindTable(TABLE_PATH, { provider: 'deepseek', deep: 'fable' }).kinds, base);
});
