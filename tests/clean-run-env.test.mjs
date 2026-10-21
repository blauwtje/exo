import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const preload = pathToFileURL(path.resolve(import.meta.dirname, 'clean-run-env.mjs')).href;

test('the preload removes every temp folder its process creates', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-run-env-'));
  try {
    const env = { ...process.env, TMPDIR: base };
    delete env.EXO_TEST_TMP_ROOT;
    const code = "const fs=require('node:fs'),os=require('node:os'),path=require('node:path');fs.mkdtempSync(path.join(os.tmpdir(),'leak-'))";
    const r = spawnSync(process.execPath, ['--import', preload, '-e', code], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(base), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
