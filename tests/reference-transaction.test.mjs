import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const HOOK = path.resolve(import.meta.dirname, '../skills/build/scripts/session-git-hooks/reference-transaction');

function repository() {
  const root = fs.realpathSync(tempDir('reference-transaction-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function runHook(root, runGitDir) {
  const update = `${'0'.repeat(40)} ${'1'.repeat(40)} refs/heads/main\n`;
  const env = { PATH: process.env.PATH, EXO_RUN_GIT_DIR: runGitDir };
  return spawnSync('sh', [HOOK, 'prepared'], { cwd: root, env, input: update, encoding: 'utf8' });
}

test('reference-transaction refuses a ref update in the run git dir', () => {
  const root = repository();
  const ran = runHook(root, path.join(root, '.git'));
  assert.equal(ran.status, 1);
  assert.match(ran.stderr, /exo run session: git refuses this ref update/);
});

test('reference-transaction allows a ref update in a foreign git dir', () => {
  const root = repository();
  const ran = runHook(root, path.join(repository(), '.git'));
  assert.equal(ran.status, 0);
  assert.equal(ran.stderr, '');
});
