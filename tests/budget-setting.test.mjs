import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCHEMA, invalidReason } from '../lib/settings-store.mjs';

const OLD = ['fast', 'balanced', 'quality', 'low', 'lean', 'medium', 'normal', 'high', 'full'];
const manifest = JSON.parse(fs.readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
const entry = manifest.userConfig?.budget ?? Object.values(manifest).map((v) => v?.budget).find(Boolean);

test('budget offers on and off and defaults to on', () => {
  assert.deepEqual(SCHEMA.budget.options, ['off', 'on']);
  assert.equal(SCHEMA.budget.default, 'on');
  assert.deepEqual(Object.keys(SCHEMA.budget.choices).sort(), ['off', 'on']);
});

test('every old value is an alias of on', () => {
  assert.deepEqual(Object.keys(SCHEMA.budget.aliases).sort(), [...OLD].sort());
  assert.ok(Object.values(SCHEMA.budget.aliases).every((v) => v === 'on'));
});

test('the plugin manifest matches the schema', () => {
  assert.deepEqual(entry.options, SCHEMA.budget.options);
  assert.equal(entry.default, SCHEMA.budget.default);
});

test('on and off are valid values', () => {
  assert.equal(invalidReason('budget', 'on'), null);
  assert.equal(invalidReason('budget', 'off'), null);
});

test('a byte cap gains the margin from run.json defaults', async () => {
  const { capMargin, resultCapBytes } = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-margin-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { resultCapBytes: 1000, capMargin: 0.2 } }));
  assert.equal(capMargin(home), 0.2);
  assert.equal(resultCapBytes(home), 1200);
  assert.equal(capMargin(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-margin-'))), 0.1);
});

test('a zero capMargin in run.json is honoured', async () => {
  const { capMargin } = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-margin-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { capMargin: 0 } }));
  assert.equal(capMargin(home), 0);
});
