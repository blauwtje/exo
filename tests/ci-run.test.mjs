import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../skills/build/scripts/ci-run.mjs');

function runCi(env) {
  const cwd = tempDir('ci-run-');
  const base = { PATH: process.env.PATH };
  return spawnSync(process.execPath, [SCRIPT], { cwd, env: { ...base, ...env }, encoding: 'utf8' });
}

test('ci-run refuses a missing result directory', () => {
  const ran = runCi({ EXO_PLAN: 'docs/specs/a.md' });
  assert.equal(ran.status, 2);
  assert.match(ran.stderr, /EXO_RESULT_DIR is not set/);
});

test('ci-run refuses a plan path outside the plan folders', () => {
  const ran = runCi({ EXO_PLAN: '../escape.md', EXO_RESULT_DIR: 'out' });
  assert.equal(ran.status, 2);
  assert.match(ran.stderr, /refused plan path/);
});
