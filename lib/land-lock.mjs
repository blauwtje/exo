import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { commonDir } from '#checkout';
import { environmentMs } from '#script-flags';
import { sleepSync } from '#basics';

export class LandLockError extends Error {}

const LOCK_FILE = 'exo-land.lock';
const LOCK_TIMEOUT_MS = 900_000;
const POLL_MS = 50;
const PS = ['/bin/ps', '/usr/bin/ps'].find((candidate) => fs.existsSync(candidate)) ?? 'ps';
const held = new Set();

function lockPath(root) {
  const common = commonDir(root);
  if (common === null) throw new LandLockError(`${root} is no git checkout`);
  return path.join(common, LOCK_FILE);
}

function readLock(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const UNSPAWNABLE = new Set(['EPERM', 'ENOENT', 'EACCES']);
const ALIVE_TOKEN = 'alive';

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function processStart(pid) {
  const result = spawnSync(PS, ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (result.error && UNSPAWNABLE.has(result.error.code)) return isAlive(pid) ? ALIVE_TOKEN : null;
  if (result.error) throw result.error;
  const start = result.stdout.trim().replace(/\s+/g, ' ');
  return result.status === 0 && start ? start : null;
}

function parseOwner(text) {
  const [pidText, start] = text.split('\n');
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0 || !start) return null;
  return { pid, start };
}

function isProven(owner) {
  return owner !== null && processStart(owner.pid) === owner.start;
}

function removeIfStale(file) {
  const text = readLock(file);
  if (text === null) return null;
  const owner = parseOwner(text);
  if (isProven(owner)) return owner;
  if (readLock(file) === text) fs.rmSync(file, { force: true });
  return null;
}

function tryCreate(file) {
  const pending = `${file}.${process.pid}`;
  fs.writeFileSync(pending, `${process.pid}\n${processStart(process.pid)}\n`);
  try {
    fs.linkSync(pending, file);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    fs.rmSync(pending, { force: true });
  }
}

function describeOwner(owner) {
  return owner ? ` (pid ${owner.pid}, started ${owner.start})` : '';
}

function acquire(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let owner = null;
  while (!tryCreate(file)) {
    owner = removeIfStale(file);
    if (Date.now() > deadline) throw new LandLockError(`another land-task holds ${file}${describeOwner(owner)}; it was not released within ${timeoutMs} ms`);
    sleepSync(POLL_MS);
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
