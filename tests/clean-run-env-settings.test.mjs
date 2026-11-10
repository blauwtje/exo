import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tempDir } from './harness.mjs';

const preload = pathToFileURL(path.resolve(import.meta.dirname, 'clean-run-env.mjs')).href;
const store = pathToFileURL(path.resolve(import.meta.dirname, '../lib/settings-store.mjs')).href;

test('the preload keeps the developer settings out of a settings read', () => {
  const project = tempDir('clean-run-env-settings-');
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.local.json'), JSON.stringify({ budget: 'off' }));
  const env = { ...process.env, CLAUDE_PLUGIN_OPTION_BUDGET: 'off' };
  delete env.EXO_TEST_TMP_ROOT;
  env.CLAUDE_PROJECT_DIR = project;
  const code = `const { settingOrDefault } = await import(${JSON.stringify(store)}); console.log(settingOrDefault('budget').value)`;
  const r = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', code], { env, cwd: project, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'on');
});

test('the preload points the Claude config folder at an empty folder', () => {
  const developer = tempDir('clean-run-env-config-');
  fs.writeFileSync(path.join(developer, 'settings.json'), JSON.stringify({ pluginConfigs: { exo: { options: { budget: 'off' } } } }));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: developer };
  delete env.EXO_TEST_TMP_ROOT;
  const code = `console.log(process.env.CLAUDE_CONFIG_DIR)`;
  const r = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', code], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(r.stdout.trim(), developer);
});
