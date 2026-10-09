// Pins run-config.mjs: the shipped provider catalog, the personal run.json merged
// over it, the keys file, the effort mapping and the refusals of resolveProvider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadRunConfig, mapEffort, readKeys, resolveProvider } from '../skills/build/scripts/run-config.mjs';

const ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];

function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'run-config-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  return home;
}

test('the catalog ships claude, deepseek and zai', () => {
  const config = loadRunConfig({ home: tempHome() });
  assert.deepEqual(Object.keys(config.providers), ['claude', 'deepseek', 'zai']);
  assert.equal(config.defaults.provider, 'claude');
  assert.equal(config.defaults.contextBudget, 60000);
  assert.deepEqual(config.providers.claude.env, {});
  assert.deepEqual(config.providers.deepseek.efforts, ['high', 'max']);
  assert.equal(config.providers.zai.env.API_TIMEOUT_MS, '3000000');
});

test('run.json merges over the catalog without dropping other keys', () => {
  const home = tempHome();
  fs.writeFileSync(
    path.join(home, '.config', 'exo', 'run.json'),
    JSON.stringify({ defaults: { effort: 'high' }, providers: { zai: { model: 'glm-x' }, mine: { model: 'm', efforts: ['low'], env: {} } } }),
  );
  const config = loadRunConfig({ home });
  assert.equal(config.defaults.effort, 'high');
  assert.equal(config.defaults.provider, 'claude');
  assert.equal(config.providers.zai.model, 'glm-x');
  assert.equal(config.providers.zai.env.ANTHROPIC_BASE_URL, 'https://api.z.ai/api/anthropic');
  assert.ok(config.providers.mine);
});

test('readKeys parses NAME=value lines and skips comments and blanks', () => {
  const dir = tempHome();
  const file = path.join(dir, 'keys.env');
  fs.writeFileSync(file, '# note\n\nDEEPSEEK_API_KEY=sk-a=b\n  ZAI_API_KEY = z1 \n');
  assert.deepEqual(readKeys(file), { DEEPSEEK_API_KEY: 'sk-a=b', ZAI_API_KEY: 'z1' });
  assert.deepEqual(readKeys(path.join(dir, 'none.env')), {});
});

test('mapEffort keeps an accepted level and otherwise picks the nearest, ties up', () => {
  assert.equal(mapEffort('high', ['high', 'max'], ORDER), 'high');
  assert.equal(mapEffort('medium', ['high', 'max'], ORDER), 'high');
  assert.equal(mapEffort('xhigh', ['low', 'high', 'max'], ORDER), 'max');
  assert.equal(mapEffort('medium', ['low', 'high', 'max'], ORDER), 'high');
  assert.equal(mapEffort('low', ['high', 'max'], ORDER), 'high');
  assert.equal(mapEffort('xhigh', ['high', 'max'], ORDER), 'max');
});

test('resolveProvider fills ${VAR} from keys and maps the effort', () => {
  const config = loadRunConfig({ home: tempHome() });
  const resolved = resolveProvider(config, 'deepseek', { DEEPSEEK_API_KEY: 'sk-1' }, 'medium');
  assert.equal(resolved.name, 'deepseek');
  assert.equal(resolved.model, 'deepseek-flash');
  assert.equal(resolved.effort, 'high');
  assert.equal(resolved.env.ANTHROPIC_AUTH_TOKEN, 'sk-1');
  assert.equal(resolved.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT, '1');
  const claude = resolveProvider(config, 'claude', {}, 'medium');
  assert.deepEqual([claude.model, claude.effort, claude.env], ['sonnet', 'medium', {}]);
});

test('resolveProvider refuses an unknown name and a missing key with a one-line fix', () => {
  const home = tempHome();
  const config = loadRunConfig({ home });
  const unknown = resolveProvider(config, 'nope', {}, 'medium', home);
  assert.match(unknown.refused, /claude, deepseek, zai/);
  assert.ok(unknown.refused.includes(path.join(home, '.config', 'exo', 'run.json')));
  assert.ok(!unknown.refused.includes('\n'));
  const missing = resolveProvider(config, 'zai', {}, 'medium', home);
  assert.match(missing.refused, /ZAI_API_KEY=/);
  assert.ok(missing.refused.includes(path.join(home, '.config', 'exo', 'keys.env')));
});
