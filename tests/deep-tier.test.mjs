import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TABLE_PATH, readKindTable } from '../lib/model-kinds.mjs';

const DEEP_KINDS = ['hardest', 'review-deep'];

test('the deep kinds inherit the session model on claude at high effort', () => {
  const { kinds } = readKindTable(TABLE_PATH, { provider: 'claude' });
  for (const name of DEEP_KINDS) {
    assert.equal(kinds[name].model, 'inherit', name);
    assert.equal(kinds[name].effort, 'high', name);
  }
});

test('every other claude kind keeps a named model', () => {
  const { kinds } = readKindTable(TABLE_PATH, { provider: 'claude' });
  for (const [name, kind] of Object.entries(kinds)) {
    if (DEEP_KINDS.includes(name) || kind.model === 'inherit') continue;
    assert.ok(['opus', 'sonnet', 'haiku'].includes(kind.model), name);
  }
});

test('codex hardest stays on its strong model', () => {
  assert.equal(readKindTable(TABLE_PATH, { provider: 'codex' }).kinds.hardest.model, 'gpt-6.1-sol');
});
