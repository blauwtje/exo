import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { budgetPin, chooseProvider } from '../skills/build/scripts/run-plan.mjs';
import { CONTEXT_LIMIT, softLimit } from '../lib/context-limits.mjs';
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

test('a listed non-claude provider pins only the kind effort, an unlisted one pins nothing', () => {
  assert.deepEqual(budgetPin('deepseek', {}, { budget: 'on' }), { effort: 'low' });
  assert.deepEqual(budgetPin('deepseek', {}, { kind: 'doc-task', budget: 'on' }), { effort: 'low' });
  assert.deepEqual(budgetPin('deepseek', {}, { retry: true, budget: 'on' }), { effort: 'high' });
  assert.deepEqual(budgetPin('deepseek', {}, { retry: true, budget: 'off' }), { model: null, effort: null });
  assert.deepEqual(budgetPin('zai', {}, { budget: 'on' }), {});
  assert.deepEqual(budgetPin('zai', {}, { retry: true, budget: 'off' }), {});
});

test('run-plan carries no narrating comment above the retry pin', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('// why: a try after a failed attempt of the same task runs on the kind'));
});

test('a resumed headless retry keeps the session pin, only a fresh retry uses the retry cell', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('const basePin = retrying && resume === null && hasPin(provider.retryPin) ? provider.retryPin : { model, effort }'));
});

test('chooseProvider takes the provider default effort before the config default', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-plan-home-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'keys.env'), 'DEEPSEEK_API_KEY=x\n');
  assert.equal(chooseProvider({ provider: 'deepseek' }, home, home).asked, 'low');
  assert.equal(chooseProvider({ provider: 'deepseek', effort: 'high' }, home, home).asked, 'high');
});

test('the run plan budgets the fixed 80k limit and ignores a contextLimit setting', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-plan-home-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), '{"defaults":{"contextLimit":200000}}');
  assert.equal(chooseProvider({}, home, home).contextBudget, softLimit(CONTEXT_LIMIT));
});
