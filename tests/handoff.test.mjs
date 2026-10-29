// handoff.mjs path outside git resolves the same config root as hooks/session-start.mjs per host.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = path.resolve('skills/save-session/scripts/handoff.mjs');

function handoffPath(host) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-')));
  const env = { ...process.env, EXO_HOST: host, CODEX_HOME: path.join(dir, 'codex'), CLAUDE_CONFIG_DIR: path.join(dir, 'claude') };
  const cwd = path.join(dir, 'work');
  fs.mkdirSync(cwd);
  const result = spawnSync('node', [script, 'path', '--cwd', cwd], { encoding: 'utf8', env });
  return { dir, out: result.stdout.trim() };
}

test('outside git on claude the handoff sits under CLAUDE_CONFIG_DIR', () => {
  const { dir, out } = handoffPath('claude');
  assert.equal(out, path.join(dir, 'claude', 'exo', 'handoff', 'work.md'));
});

test('outside git on codex the handoff sits under CODEX_HOME', () => {
  const { dir, out } = handoffPath('codex');
  assert.equal(out, path.join(dir, 'codex', 'exo', 'handoff', 'work.md'));
});

test('importing handoff.mjs runs no command and exports the path of a branch', async () => {
  const { handoffFile } = await import('../skills/save-session/scripts/handoff.mjs');
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-git-'));
  spawnSync('git', ['-C', repository, 'init', '-q', '-b', 'topic']);
  spawnSync('git', ['-C', repository, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'start']);
  const printed = spawnSync('node', [script, 'path', '--cwd', repository], { encoding: 'utf8' }).stdout.trim();
  assert.equal(handoffFile(repository), printed);
  assert.match(printed, /exo[\\/]handoff[\\/]topic\.md$/);
});
