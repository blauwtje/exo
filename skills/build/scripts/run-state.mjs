// State of `exo run` runs: <root>/.exo/run/<id>/state.json per run and one lock
// file <root>/.exo/run/lock holding the id of the run that owns the checkout.
// Pure file functions; every writer of these files goes through this module.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PHASES = ['starting', 'build', 'verify', 'passed', 'stopped', 'refused', 'crashed'];
export const FINAL_PHASES = ['passed', 'stopped', 'refused', 'crashed'];

const runsDir = (root) => path.join(root, '.exo', 'run');
const lockFile = (root) => path.join(runsDir(root), 'lock');

export function runDir(root, id) {
  return path.join(runsDir(root), id);
}

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

export function newRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

export function readState(root, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir(root, id), 'state.json'), 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function createRun(root, { id = newRunId(), plan, flags = [], detach = false, pid = process.pid, log = null }) {
  const now = new Date().toISOString();
  const state = { id, plan, root, flags, detach, pid, phase: 'starting', log, startedAt: now, updatedAt: now, exitCode: null };
  writeAtomic(path.join(runDir(root, id), 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function updateRun(root, id, patch) {
  const state = readState(root, id);
  if (!state) throw new Error(`no run ${id} in ${root}`);
  if (patch.phase !== undefined && !PHASES.includes(patch.phase)) throw new Error(`unknown phase ${patch.phase}`);
  const next = { ...state, ...patch, id, updatedAt: new Date().toISOString() };
  writeAtomic(path.join(runDir(root, id), 'state.json'), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// Oldest first.
export function listRuns(root) {
  let names;
  try {
    names = fs.readdirSync(runsDir(root), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  return names.map((n) => readState(root, n)).filter(Boolean)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
}

// Take the lock for run `id`. Returns { ok: true, stale?: previousId } or
// { ok: false, holder: id }. A lock whose run is final, missing or has a dead pid is stale.
export function acquireLock(root, id) {
  const file = lockFile(root);
  fs.mkdirSync(runsDir(root), { recursive: true });
  let stale;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, `${id}\n`, { flag: 'wx' });
      return stale ? { ok: true, stale } : { ok: true };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    let holder = '';
    try {
      holder = fs.readFileSync(file, 'utf8').trim();
    } catch {
      continue;
    }
    const state = holder ? readState(root, holder) : null;
    if (state && !FINAL_PHASES.includes(state.phase) && isAlive(state.pid)) return { ok: false, holder };
    stale = holder || undefined;
    try {
      fs.unlinkSync(file);
    } catch {}
  }
  return { ok: false, holder: '' };
}

// Remove the lock only when `id` still owns it.
export function releaseLock(root, id) {
  try {
    if (fs.readFileSync(lockFile(root), 'utf8').trim() === id) fs.unlinkSync(lockFile(root));
  } catch {}
}
