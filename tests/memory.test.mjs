// The project memory on disk: where the two files sit, what the rendered file
// says, and every rule the writer enforces before it changes them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const MEMORY = fileURLToPath(new URL('../skills/memory/scripts/memory.mjs', import.meta.url));

// A real repository, so the store resolves to its git directory and no test ever
// writes beside the caller's own savings record. The path is resolved through
// realpath first: the temp directory is reached through a symlink on macOS, and
// git reports the resolved path, which no assertion built from mkdtemp matches.
async function repository() {
  const root = fs.realpathSync(await fixture());
  const init = spawnSync('git', ['-C', root, 'init', '-b', 'main'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return root;
}

function memory(root, ...args) {
  return run(MEMORY, [...args, '--cwd', root], { cwd: root });
}

test('paths names both files inside the repository git directory', async () => {
  const root = await repository();
  const result = await memory(root, 'paths');
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim().split('\n');
  assert.deepEqual(printed, [
    path.join(root, '.git', 'exo', 'memory.json'),
    path.join(root, '.git', 'exo', 'memory.md')
  ]);
});

test('an empty memory renders both sections and writes no file', async () => {
  const root = await repository();
  const result = await memory(root, 'render');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /## Current understanding\n\nNothing is attested twice yet\./);
  assert.match(result.stdout, /## Decisions\n\nNothing has been written yet\./);
  assert.equal(fs.existsSync(path.join(root, '.git', 'exo', 'memory.json')), false);
});
