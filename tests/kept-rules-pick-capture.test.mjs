import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const scripts = {
  pick: new URL('../skills/design-ui/scripts/pick.mjs', import.meta.url).pathname,
  capture: new URL('../skills/design-ui/scripts/capture.mjs', import.meta.url).pathname
};

test('pick --help prints its usage and exits 0', () => {
  const run = spawnSync(process.execPath, [scripts.pick, '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--comps <dir> --contracts <contracts\.json>/);
  assert.match(run.stdout, /--check/);
  assert.match(run.stdout, /Exit 2 is a usage error; exit 3/);
});

test('capture --help prints its usage and exits 0', () => {
  const run = spawnSync(process.execPath, [scripts.capture, '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--url <file:\/\/ or http:\/\/ url>/);
  assert.match(run.stdout, /--color-scheme light\|dark\|no-preference/);
});

test('capture refuses an unsafe label with exit 2', () => {
  const run = spawnSync(process.execPath, [scripts.capture, '--url', 'http://localhost:1/', '--label', '../x'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--label must be a plain file-name token/);
});

test('pick refuses --variant without --check with exit 2', () => {
  const run = spawnSync(process.execPath, [scripts.pick, '--variant', '0'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
});
