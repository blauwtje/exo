// The savings ledger on disk: one JSON file keyed by session id, written
// through a rename so a status line render never reads a half file, and
// updated behind a directory lock so two hooks firing at once lose nothing.
// Shared by savings.mjs (usage and overhead per session) and read-guard.mjs
// (reads withheld).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

// Every hook in hooks/hooks.json times out after 10 s, so a lock older than
// LOCK_STALE_MS outlived any hook and belongs to one that died, and a waiter
// gives up before its own hook's timeout kills it mid-write.
const LOCK_WAIT_MS = 8000;
const LOCK_STALE_MS = 15000;
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function configDirectory() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// EXO_SAVINGS_DIR relocates the ledger and its config alone, so a benchmark
// cell keeps its own ledger while the session keeps its login and settings.
export function ledgerDirectory() {
  return process.env.EXO_SAVINGS_DIR || path.join(configDirectory(), 'exo', 'savings');
}

export function ledgerFile() {
  return path.join(ledgerDirectory(), 'sessions.json');
}

export function configFile() {
  return path.join(ledgerDirectory(), 'config.json');
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// A missing ledger is an empty one; any other read or parse failure throws,
// because a ledger written back without being read drops every session in it.
export function readLedger() {
  const file = ledgerFile();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, file);
}

// One switch for the counter, the status line segment and the read guard: EXO_SAVINGS=off|on outranks "enabled" in config.json.
export function savingsEnabled() {
  const override = process.env.EXO_SAVINGS;
  if (override === 'off') return false;
  if (override === 'on') return true;
  const config = readJson(configFile(), {});
  return config.enabled !== false;
}

export function emptySession() {
  return {
    started: null,
    updated: null,
    touched: null,
    transcript: null,
    project: null,
    model: null,
    offsets: {},
    usageById: {},
    reads: {},
    guard: { hookMs: 0, refusals: {} },
    overhead: null
  };
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// Removes the lock only while it is the one found stale: a lock a live hook
// took in the meantime carries a newer mtime and stays.
function removeStaleLock(lock, staleMtimeMs) {
  try {
    if (fs.statSync(lock).mtimeMs !== staleMtimeMs) return;
  } catch {
    return;
  }
  fs.rmSync(lock, { recursive: true, force: true });
}

// A directory is the lock because mkdir is atomic on every platform Node
// runs on; a lock older than LOCK_STALE_MS belongs to a hook that died.
function withLedgerLock(work) {
  const lock = `${ledgerFile()}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let found;
    try {
      found = fs.statSync(lock);
    } catch {
      continue;
    }
    if (Date.now() - found.mtimeMs > LOCK_STALE_MS) {
      removeStaleLock(lock, found.mtimeMs);
      continue;
    }
    if (Date.now() > deadline) throw new Error(`ledger locked by another hook for over ${LOCK_WAIT_MS} ms`);
    sleep(20);
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

// A row without any date was written before pruning existed; its age is
// unknown, so it stays.
function pruneSessions(sessions, now) {
  let pruned = false;
  for (const [sessionId, session] of Object.entries(sessions)) {
    const touched = Date.parse(session.touched ?? session.updated ?? session.started ?? '');
    if (Number.isNaN(touched)) continue;
    if (now - touched > SESSION_RETENTION_MS) {
      delete sessions[sessionId];
      pruned = true;
    }
  }
  return pruned;
}

// mutate returns true when the session changed; the ledger is written only
// then, or when a stale session was pruned. A row written by an older
// version gains the fields it lacks.
export function updateSession(sessionId, mutate) {
  return withLedgerLock(() => {
    const sessions = readLedger();
    const session = { ...emptySession(), ...(sessions[sessionId] ?? {}) };
    const changed = mutate(session);
    const now = Date.now();
    const pruned = pruneSessions(sessions, now);
    if (changed || pruned || sessions[sessionId] === undefined) {
      session.touched = new Date(now).toISOString();
      sessions[sessionId] = session;
      writeJson(ledgerFile(), sessions);
    }
    return sessions;
  });
}

// Rewrites rows no hook is touching, such as an older row read again: stale
// rows are pruned first, so mutate never brings one back, and no row's
// touched moves. mutate returns true when it changed a row.
export function updateSessions(mutate) {
  return withLedgerLock(() => {
    const sessions = readLedger();
    const pruned = pruneSessions(sessions, Date.now());
    const changed = mutate(sessions);
    if (changed || pruned) writeJson(ledgerFile(), sessions);
    return sessions;
  });
}
