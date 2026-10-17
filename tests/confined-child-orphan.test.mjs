import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { confineRefusal } from '../lib/confine-claude.mjs';

const WRAPPER = path.resolve(import.meta.dirname, '../benchmarks/confined-child.mjs');

// why: the fake ends itself after this bound and the test waits at most this many rounds, so no path leaks it.
const FAKE_LIFETIME_MS = 20_000;
const ROUND_MS = 100;
const START_ROUNDS = 100;
const GONE_ROUNDS = 100;

// why: records its real pid (process.pid, not a shell's `$`) so cleanup kills exactly this process.
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.FAKE_CLAUDE_PID_FILE, String(process.pid));
setTimeout(() => process.exit(0), ${FAKE_LIFETIME_MS});
`;

// why: starts the wrapper, records its pid, then idles until the test SIGKILLs it; it ends itself no sooner than the fake does, so a dead test runner leaks neither.
const PARENT = `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const child = spawn(process.execPath, [process.argv[1]], { stdio: 'ignore' });
fs.writeFileSync(process.argv[2], String(child.pid));
setTimeout(() => process.exit(0), ${FAKE_LIFETIME_MS});
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readPid(file) {
  for (let round = 0; round < START_ROUNDS; round += 1) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (/^\d+$/.test(text)) return Number(text);
    await sleep(ROUND_MS);
  }
  return undefined;
}

function kill(pid, signal) {
  if (pid === undefined) return;
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
}

test('confined-child ends its claude when its parent dies without a signal', { skip: confineRefusal() !== undefined, timeout: 50_000 }, async () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confined-orphan-')));
  const root = path.join(base, 'cell');
  const bin = path.join(base, 'bin');
  fs.mkdirSync(root);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'claude'), FAKE_CLAUDE, { mode: 0o755 });
  const fakePidFile = path.join(root, 'fake.pid');
  const wrapperPidFile = path.join(root, 'wrapper.pid');
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    CLAUDE_CONFIG_DIR: path.join(base, 'config'),
    EXO_SWEEP_CELL_ROOT: root,
    EXO_PARENT_POLL_MS: '100',
    FAKE_CLAUDE_PID_FILE: fakePidFile
  };
  const parent = spawn(process.execPath, ['-e', PARENT, WRAPPER, wrapperPidFile], { cwd: root, env, stdio: 'ignore' });
  let fakePid;
  let wrapperPid;
  try {
    fakePid = await readPid(fakePidFile);
    wrapperPid = await readPid(wrapperPidFile);
    assert.ok(fakePid !== undefined && wrapperPid !== undefined, 'the fake claude never started under the wrapper');
    assert.ok(alive(fakePid) && alive(wrapperPid), 'the tree must be running before its parent dies');
    parent.kill('SIGKILL');
    let rounds = 0;
    while ((alive(fakePid) || alive(wrapperPid)) && rounds < GONE_ROUNDS) {
      await sleep(ROUND_MS);
      rounds += 1;
    }
    assert.equal(alive(fakePid), false, `claude (pid ${fakePid}) outlived the wrapper's parent`);
    assert.equal(alive(wrapperPid), false, `the wrapper (pid ${wrapperPid}) outlived its parent`);
  } finally {
    parent.kill('SIGKILL');
    kill(wrapperPid, 'SIGKILL');
    kill(fakePid, 'SIGKILL');
    fs.rmSync(base, { recursive: true, force: true });
  }
});
