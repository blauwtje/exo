// A session that loads exo from a linked worktree points plugin-root there; once that worktree is
// removed, the status line, the exo shim and exo-cli fall back to the main checkout in plugin-main.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OLD_STATUSLINE_LAUNCHERS, STATUSLINE_LAUNCHER, mainCheckout } from '#plugin-pointer';

const REPOSITORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SETTINGS = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'settings.mjs');
const CLI = path.join(REPOSITORY, 'skills', 'build', 'scripts', 'exo-cli.mjs');
const HOOK = path.join(REPOSITORY, 'hooks', 'session-start.mjs');

const tempDir = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `exo-${label}-`));

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

// A main checkout with a linked worktree, then the worktree removed: plugin-root names the gone path.
function goneWorktreeConfig(main) {
  const repo = tempDir('pointer-repo');
  git(repo, 'init', '-q');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const worktree = path.join(repo, 'linked');
  git(repo, 'worktree', 'add', '-q', worktree);
  assert.equal(fs.realpathSync(mainCheckout(worktree)), fs.realpathSync(repo));
  git(repo, 'worktree', 'remove', worktree);
  assert.equal(fs.existsSync(worktree), false);
  const config = tempDir('pointer-config');
  fs.mkdirSync(path.join(config, 'exo'));
  fs.writeFileSync(path.join(config, 'exo', 'plugin-root'), `${worktree}\n`);
  fs.writeFileSync(path.join(config, 'exo', 'plugin-main'), `${main}\n`);
  return config;
}

const PAYLOAD = JSON.stringify({ model: { display_name: 'Opus 5.5' }, context_window: { total_input_tokens: 1000, context_window_size: 200000 } });

test('the status line falls back to the main checkout once the pointed worktree is gone', () => {
  const config = goneWorktreeConfig(REPOSITORY);
  const install = spawnSync(process.execPath, [SETTINGS, 'statusline'], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: config, EXO_HOST: 'claude' } });
  assert.equal(install.status, 0, install.stderr);
  const result = spawnSync(process.execPath, [path.join(config, 'exo', 'statusline.mjs')], {
    encoding: 'utf8',
    input: PAYLOAD,
    env: { ...process.env, NO_COLOR: '1', XDG_CACHE_HOME: tempDir('cache') }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^◉ exo .*Opus 5\.5/);
});

test('the exo shim falls back to the main checkout once the pointed worktree is gone', () => {
  const config = goneWorktreeConfig(REPOSITORY);
  const home = tempDir('pointer-home');
  const setup = spawnSync(process.execPath, [CLI, 'setup'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(setup.status, 0, setup.stderr);
  const result = spawnSync('/bin/sh', [path.join(home, '.local', 'bin', 'exo'), '--help'], { encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: config } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /exo run/);
});

test('exo-cli reads the main checkout as the pointer once the pointed worktree is gone', async () => {
  const main = tempDir('pointer-main');
  const config = goneWorktreeConfig(main);
  const { refuseLoadedCheckout } = await import(CLI);
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    assert.throws(() => refuseLoadedCheckout(REPOSITORY, CLI), (error) => error.message.includes(`plugin-root pointer is ${main};`));
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
  }
});

test('the session hook records the main checkout and upgrades an old status line launcher', () => {
  const config = tempDir('pointer-hook');
  fs.mkdirSync(path.join(config, 'exo'));
  const launcher = path.join(config, 'exo', 'statusline.mjs');
  fs.writeFileSync(launcher, OLD_STATUSLINE_LAUNCHERS[0]);
  execFileSync(process.execPath, [HOOK], { env: { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: REPOSITORY, EXO_HOST: 'claude' }, input: '{}' });
  assert.equal(fs.readFileSync(path.join(config, 'exo', 'plugin-root'), 'utf8'), `${REPOSITORY}\n`);
  const main = path.dirname(git(REPOSITORY, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  assert.equal(fs.realpathSync(fs.readFileSync(path.join(config, 'exo', 'plugin-main'), 'utf8').trim()), fs.realpathSync(main));
  assert.equal(fs.readFileSync(launcher, 'utf8'), STATUSLINE_LAUNCHER);
});

test('configure overwrites an old launcher instead of refusing it', () => {
  const config = tempDir('pointer-old');
  fs.mkdirSync(path.join(config, 'exo'));
  const launcher = path.join(config, 'exo', 'statusline.mjs');
  fs.writeFileSync(launcher, OLD_STATUSLINE_LAUNCHERS[0]);
  const result = spawnSync(process.execPath, [SETTINGS, 'statusline'], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: config, EXO_HOST: 'claude' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(launcher, 'utf8'), STATUSLINE_LAUNCHER);
});
