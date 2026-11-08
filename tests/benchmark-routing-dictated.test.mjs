import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spokenSplit } from '../benchmarks/routing-spoken.mjs';

const prompts = JSON.parse(readFileSync(new URL('../benchmarks/routing/prompts.json', import.meta.url), 'utf8'));

test('spokenSplit scores spoken and typed sessions apart and skips errored ones', () => {
  const sessions = [
    { spoken: true, expect: 'build', pick: 'build' },
    { spoken: true, expect: 'build', pick: null },
    { spoken: false, expect: 'ship', pick: 'ship' },
    { expect: null, pick: null },
    { spoken: false, expect: 'ship', pick: null, error: 'timeout' }
  ];
  assert.deepEqual(spokenSplit(sessions), {
    spoken: { trials: 2, accuracy: 0.5 },
    typed: { trials: 2, accuracy: 1 }
  });
  assert.equal(spokenSplit([]).spoken.accuracy, null);
});

test('prompts.json carries spoken entries with a boolean flag', () => {
  const spoken = prompts.filter((entry) => entry.spoken !== undefined);
  assert.ok(spoken.length >= 4);
  assert.ok(spoken.every((entry) => entry.spoken === true));
});
