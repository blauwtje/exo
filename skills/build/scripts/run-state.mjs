import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PHASES = ['starting', 'build', 'verify', 'landing', 'passed', 'landed', 'parked', 'stopped', 'refused', 'crashed'];
export const FINAL_PHASES = ['passed', 'landed', 'parked', 'stopped', 'refused', 'crashed'];

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
  const state = { id, plan, root, flags, detach, pid, phase: 'starting', stage: 'build', log, startedAt: now, updatedAt: now, exitCode: null };
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

export function recordTask(root, id, { n, subject, landed, total }) {
  return updateRun(root, id, { task: { n, subject }, landed, total });
}

export function recordStop(root, id, { phase, reason }) {
  return updateRun(root, id, { phase, reason });
}

const gatesFile =(dir) => path.join(dir, 'gates.md');
const GATE_LINE = /^- (open|approved|used): ([^:]+): (.*) \(([^()]*)\)$/;

export function readGates(dir) {
  let text;
  try {
    text = fs.readFileSync(gatesFile(dir), 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').map((l) => GATE_LINE.exec(l)).filter(Boolean)
    .map((m) => ({ status: m[1], source: m[2], action: m[3], reason: m[4] }));
}

function writeGates(dir, gates) {
  const text = gates.map((g) => `- ${g.status}: ${g.source}: ${g.action} (${g.reason})\n`).join('');
  writeAtomic(gatesFile(dir), text);
}

const oneLine = (action) => action.replace(/\s*\n\s*/g, ' ').trim();

export function openGate(dir, { source, action, reason }) {
  const gates = readGates(dir);
  const act = oneLine(action);
  if (gates.some((g) => g.status === 'open' && g.source === source && g.action === act)) return;
  gates.push({ status: 'open', source, action: act, reason: reason.replace(/[()\n]/g, ' ').trim() });
  writeGates(dir, gates);
}

export function approveGates(dir) {
  const gates = readGates(dir);
  let n = 0;
  for (const g of gates) if (g.status === 'open') { g.status = 'approved'; n++; }
  if (n) writeGates(dir, gates);
  return n;
}

export function takeApproved(dir, action) {
  const gates = readGates(dir);
  const g = gates.find((x) => x.status === 'approved' && x.action === oneLine(action));
  if (!g) return false;
  g.status = 'used';
  writeGates(dir, gates);
  return true;
}

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

export function removeRun(root, id) {
  fs.rmSync(runDir(root, id), { recursive: true, force: true });
}

export function keptDir(root, id) {
  return path.join(root, '.exo', 'kept', id);
}

export function keepRun(root, id) {
  const from = runDir(root, id);
  const to = keptDir(root, id);
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) {
    process.stderr.write(`exo: run ${id} stays in ${from}: ${to} exists\n`);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    settle(() => fs.renameSync(from, to));
  } catch (error) {
    process.stderr.write(`exo: run ${id} stays in ${from}: ${error.message}\n`);
  }
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const claimFile = (root, key, n) => path.join(runsDir(root), `lock.${key}.${n}`);

function scratch(root, text) {
  const file = path.join(runsDir(root), `lock.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(file, text, { flag: 'wx' });
  return file;
}

function drop(file) {
  try {
    fs.unlinkSync(file);
  } catch {}
}

// why: Windows refuses for a moment to replace or unlink a file another process has open.
function settle(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      if (attempt >= 40 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      pause(5);
    }
  }
}

function readLock(root) {
  let fd;
  try {
    fd = fs.openSync(lockFile(root), 'r');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const { ino, mtimeNs } = fs.fstatSync(fd, { bigint: true });
    return { holder: fs.readFileSync(fd, 'utf8').trim(), key: `${ino}-${mtimeNs}` };
  } finally {
    fs.closeSync(fd);
  }
}

function claim(root, key, token) {
  for (let n = 0; n < 16; n++) {
    try {
      fs.linkSync(token, claimFile(root, key, n));
      return n;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    let pid = 0;
    try {
      pid = Number(fs.readFileSync(claimFile(root, key, n), 'utf8'));
    } catch {}
    if (isAlive(pid)) return -1;
  }
  return -1;
}

function unclaim(root, key, n) {
  for (let k = 0; k <= n; k++) drop(claimFile(root, key, k));
}

function held(root, holder, id) {
  if (holder === '' || holder === id) return false;
  const state = readState(root, holder);
  return state !== null && !FINAL_PHASES.includes(state.phase) && isAlive(state.pid);
}

export function acquireLock(root, id) {
  const file = lockFile(root);
  fs.mkdirSync(runsDir(root), { recursive: true });
  const mine = scratch(root, `${id}\n`);
  let token = null;
  let holder = '';
  try {
    for (let attempt = 0; attempt < 400; attempt++) {
      try {
        fs.linkSync(mine, file);
        return { ok: true };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      const lock = readLock(root);
      if (lock === null) continue;
      holder = lock.holder;
      if (held(root, holder, id)) return { ok: false, holder };
      token ??= scratch(root, `${process.pid}\n`);
      const n = claim(root, lock.key, token);
      if (n < 0) {
        pause(5);
        continue;
      }
      if (readLock(root)?.key === lock.key) {
        settle(() => fs.renameSync(mine, file));
        unclaim(root, lock.key, n);
        return holder ? { ok: true, stale: holder } : { ok: true };
      }
      unclaim(root, lock.key, n);
    }
    return { ok: false, holder };
  } finally {
    drop(mine);
    if (token) drop(token);
  }
}

export function releaseLock(root, id) {
  let token = null;
  try {
    const lock = readLock(root);
    if (lock === null || lock.holder !== id) return;
    token = scratch(root, `${process.pid}\n`);
    const n = claim(root, lock.key, token);
    if (n < 0) return;
    if (readLock(root)?.key === lock.key) settle(() => fs.unlinkSync(lockFile(root)));
    unclaim(root, lock.key, n);
  } catch {
  } finally {
    if (token) drop(token);
  }
}
