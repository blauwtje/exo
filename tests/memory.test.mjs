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

test('a claim booked in one session is not proposed', async () => {
  const root = await repository();
  const booked = await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  assert.equal(booked.code, 0, booked.stderr);
  const proposed = await memory(root, 'propose');
  assert.equal(proposed.code, 0, proposed.stderr);
  assert.match(proposed.stdout, /no claim is attested twice yet/);
  assert.doesNotMatch(proposed.stdout, /the suite runs under node --test/);
});

test('a second booking from the same session does not make a second attestation', async () => {
  const root = await repository();
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'again, node --test', '--session', 'one');
  const proposed = await memory(root, 'propose');
  assert.match(proposed.stdout, /no claim is attested twice yet/);
});

test('a claim booked in two sessions is proposed with both dated quotes', async () => {
  const root = await repository();
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'no, it is node --test', '--session', 'one');
  await memory(root, 'book', '--claim', 'the suite runs under node --test', '--quote', 'I said node --test', '--session', 'two');
  const proposed = await memory(root, 'propose');
  assert.equal(proposed.code, 0, proposed.stderr);
  assert.match(proposed.stdout, /the suite runs under node --test/);
  assert.match(proposed.stdout, /no, it is node --test/);
  assert.match(proposed.stdout, /I said node --test/);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(proposed.stdout.split(today).length - 1, 2);
});
