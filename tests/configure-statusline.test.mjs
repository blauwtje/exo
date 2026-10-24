import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(repo, 'skills', 'configure', 'scripts', 'settings.mjs');

function run(config, env = {}) {
  return spawnSync(process.execPath, [script, 'statusline'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: config, EXO_HOST: 'claude', ...env }
  });
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'exo-statusline-'));

test('statusline writes the launcher and prints the statusLine block', () => {
  const config = tempDir();
  const result = run(config);
  const target = path.join(config, 'exo', 'statusline.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(target));
  const block = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  assert.equal(block.type, 'command');
  assert.equal(block.command, `node "${target.split(path.sep).join('/')}"`);
  assert.equal(run(config).status, 0, 'rerun over its own launcher is allowed');
});

test('statusline refuses a foreign file and leaves it untouched', () => {
  const config = tempDir();
  const target = path.join(config, 'exo', 'statusline.mjs');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'mine\n');
  const result = run(config);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refused/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'mine\n');
});

test('statusline writes nothing on Codex', () => {
  const config = tempDir();
  const result = run(config, { EXO_HOST: 'codex' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Claude Code only/);
  assert.equal(fs.existsSync(path.join(config, 'exo')), false);
});

test('the launcher renders a fixture line through a plugin-root pointer', () => {
  const config = tempDir();
  run(config);
  fs.writeFileSync(path.join(config, 'exo', 'plugin-root'), `${repo}\n`);
  const payload = { model: { display_name: 'Opus 5.5' }, context_window: { total_input_tokens: 1000, context_window_size: 200000 } };
  const result = spawnSync(process.execPath, [path.join(config, 'exo', 'statusline.mjs')], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: { ...process.env, NO_COLOR: '1', XDG_CACHE_HOME: tempDir() }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^◉ exo /);
  assert.match(result.stdout, /Opus 5\.5/);
});

test('the launcher prints nothing and exits 0 without a pointer', () => {
  const config = tempDir();
  run(config);
  const result = spawnSync(process.execPath, [path.join(config, 'exo', 'statusline.mjs')], { encoding: 'utf8', input: '{}' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});
