import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));

function exoRunConfig(home, ...args) {
  return spawnSync(process.execPath, [CLI, 'run', 'config', ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } });
}

test('exo run config writes a JSON value, keeps a plain string and prints the key as run.json', () => {
  const home = tempDir('exo-config-');

  const numeric = exoRunConfig(home, 'count', '3');
  const plain = exoRunConfig(home, 'name', 'not json');
  const printed = exoRunConfig(home);

  assert.equal(numeric.status, 0);
  assert.equal(plain.status, 0);
  const written = JSON.parse(fs.readFileSync(path.join(home, '.config', 'exo', 'run.json'), 'utf8'));
  assert.deepEqual(written, { count: 3, name: 'not json' });
  assert.match(printed.stdout, /count = 3 \(run\.json\)/);
});

test('exo run config with one argument refuses and names the arguments given', () => {
  const result = exoRunConfig(tempDir('exo-config-'), 'only-key');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: exo run config \[<key> <value>\]; got: only-key/);
});
