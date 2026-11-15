import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const settingsScript = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'configure', 'scripts', 'settings.mjs');

test('the written launcher prints the context line without any pointer file', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-statusline-'));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir, NO_COLOR: '1' };
  delete env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  const written = spawnSync('node', [settingsScript, 'statusline'], { env, encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
  const payload = { model: { display_name: 'Opus' }, context_window: { context_window_size: 200000, current_usage: { input_tokens: 50000 } } };
  const launched = spawnSync('node', [path.join(configDir, 'exo', 'statusline.mjs')], { env, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.match(launched.stdout, /ctx 50k\/200k/);
});

test('the statusline command replaces a launcher from an older exo', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-statusline-'));
  fs.mkdirSync(path.join(configDir, 'exo'));
  fs.writeFileSync(path.join(configDir, 'exo', 'statusline.mjs'), "await import(path.join(root, 'lib', 'statusline.mjs'));\n");
  const written = spawnSync('node', [settingsScript, 'statusline'], { env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }, encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
});
