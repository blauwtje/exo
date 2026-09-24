// Where a handoff sits, matching the location hooks/session-start.sh computes
// for a resuming session.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, gitRepository, run } from './harness.mjs';

const HANDOFF = fileURLToPath(new URL('../skills/handoff/scripts/handoff.mjs', import.meta.url));

// A real repository on branch main with one commit: `rev-parse --abbrev-ref
// HEAD` names the branch only once HEAD resolves to a commit, printing the
// literal `HEAD` on an unborn branch instead.
async function repository() {
  return gitRepository({ 'README.md': 'fixture\n' });
}

function handoff(root, ...args) {
  return run(HANDOFF, [...args, '--cwd', root], { cwd: root });
}

test('path names the file under the repository git directory, keyed by branch', async () => {
  const root = await repository();
  const result = await handoff(root, 'path');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(root, '.git', 'exo', 'handoff', 'main.md'));
});

test('a branch name holding a slash nests the path', async () => {
  const root = await repository();
  const checkout = spawnSync('git', ['-C', root, 'checkout', '-b', 'feature/thing'], { encoding: 'utf8' });
  assert.equal(checkout.status, 0, checkout.stderr);
  const result = await handoff(root, 'path');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(root, '.git', 'exo', 'handoff', 'feature', 'thing.md'));
});

test('outside a repository the file falls back to the config directory, keyed by folder name', async () => {
  const root = fs.realpathSync(await fixture());
  const workingDirectory = path.join(root, 'my-project');
  fs.mkdirSync(workingDirectory);
  const configDirectory = path.join(root, 'config');
  const result = await run(HANDOFF, ['path', '--cwd', workingDirectory], { env: { CLAUDE_CONFIG_DIR: configDirectory } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(configDirectory, 'exo', 'handoff', 'my-project.md'));
});
