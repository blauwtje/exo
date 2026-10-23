import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetPin } from '../skills/build/scripts/run-plan.mjs';
import { INHERIT, readKindTable } from '../lib/model-kinds.mjs';

const cell = (kind, retry) => {
  const { model, effort } = readKindTable(undefined, { budget: 'on', retry }).kinds[kind];
  return { model: model === INHERIT ? null : model, effort };
};

test('budgetPin reads the on cell, and the retry cell on a retry', () => {
  for (const kind of ['build-task', 'doc-task']) {
    assert.deepEqual(budgetPin('claude', {}, { kind, retry: false, budget: 'on' }), cell(kind, false));
    assert.deepEqual(budgetPin('claude', {}, { kind, retry: true, budget: 'on' }), cell(kind, true));
    assert.notDeepEqual(cell(kind, true), cell(kind, false));
  }
});

test('budget off and an explicit flag pin nothing on a retry', () => {
  assert.deepEqual(budgetPin('claude', {}, { retry: true, budget: 'off' }), { model: null, effort: null });
  assert.deepEqual(budgetPin('claude', { model: 'x' }, { retry: true, budget: 'on' }), {});
});

test('run-plan carries no narrating comment above the retry pin', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('// why: a try after a failed attempt of the same task runs on the kind'));
});

test('a resumed headless retry keeps the session pin, only a fresh retry uses the retry cell', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('const basePin = retrying && resume === null && provider.retryPin.model !== undefined'));
});
