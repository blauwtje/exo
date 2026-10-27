import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { environmentMs } from '#script-flags';

export class LandLockError extends Error {}

const LOCK_FILE = 'exo-land.lock';
const LOCK_TIMEOUT_MS = 900_000;
const POLL_MS = 50;
const held = new Set();

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockPath(root) {
  const gitDirectory = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  return path.join(gitDirectory, LOCK_FILE);
}

function ownerOf(file) {
  try {
    return Number(fs.readFileSync(file, 'utf8').trim());
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function removeIfStale(file) {
  const owner = ownerOf(file);
  if (owner === null || (Number.isInteger(owner) && owner > 0 && isAlive(owner))) return;
  if (ownerOf(file) !== owner) return;
  fs.rmSync(file, { force: true });
}

function tryCreate(file) {
  try {
    fs.writeFileSync(file, `${process.pid}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function acquire(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!tryCreate(file)) {
    removeIfStale(file);
    if (Date.now() > deadline) throw new LandLockError(`another land-task holds ${file}; it was not released within ${timeoutMs} ms`);
    sleep(POLL_MS);
  }
}

export function withLandLock(root, action, { timeoutMs = environmentMs('EXO_LAND_LOCK_MS', LOCK_TIMEOUT_MS) } = {}) {
  const file = lockPath(root);
  if (held.has(file)) return action();
  acquire(file, timeoutMs);
  held.add(file);
  try {
    return action();
  } finally {
    held.delete(file);
    fs.rmSync(file, { force: true });
  }
}
