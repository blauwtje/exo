// The savings record on disk: one JSON file keyed by session id, written
// through a rename so a status line render never reads a half file, and
// updated behind a directory lock so two hooks firing at once lose nothing.
// Shared by savings.mjs (usage and overhead per session) and read-guard.mjs
// (reads withheld).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';

// Every hook in hooks/hooks.json times out after 10 s, so a lock older than
// LOCK_STALE_MS outlived any hook and belongs to one that died, and a waiter
// gives up before its own hook's timeout kills it mid-write.
const LOCK_WAIT_MS = 8000;
const LOCK_STALE_MS = 15000;
export const SESSION_RETENTION_DAYS = 30;
const SESSION_RETENTION_MS = SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Anthropic's glossary puts one token at about 3.5 English characters. The
// guard booked bytes, not characters, so text outside ASCII overcounts slightly.
// Exported here because savings.mjs, which prints it, runs its command on import.
export const CHARACTERS_PER_TOKEN = 3.5;

// EXO_SAVINGS_DIR relocates the record and its config alone, so a benchmark
// cell keeps its own record while the session keeps its login and settings.
function recordDirectory() {
  return process.env.EXO_SAVINGS_DIR || path.join(configDirectory(), 'exo', 'savings');
}

export function recordFile() {
  return path.join(recordDirectory(), 'sessions.json');
}

function hotSessionsDirectory() {
  return path.join(recordDirectory(), 'sessions');
}

// A session id becomes a file name, so only the shape transcript.mjs already
// accepts for the same purpose is allowed; every hook already catches a
// throw here and exits 0.
const SESSION_ID = /^[\w-]+$/;

export function hotFile(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  return path.join(hotSessionsDirectory(), `${sessionId}.json`);
}

export function configFile() {
  return path.join(recordDirectory(), 'config.json');
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// A missing record is an empty one; any other read or parse failure throws,
// because a record written back without being read drops every session in it.
export function readRecord() {
  const file = recordFile();
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

export const DEFAULT_GUARD_LINES = 400;

// The line count above which the read guard refuses a whole-file read:
// "readGuardLines" in config.json when it is a whole number of at least 1,
// otherwise the default, so a broken hand edit never switches the guard off.
export function guardLines() {
  const configured = readJson(configFile(), {}).readGuardLines;
  if (Number.isSafeInteger(configured) && configured >= 1) return configured;
  return DEFAULT_GUARD_LINES;
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
    calls: {},
    guard: { hookMs: 0, refusals: {} },
    restate: { baseline: null },
    overhead: null
  };
}

// The fields a hook touches on every call: split into their own file so a
// hook never reads or rewrites the whole (potentially multi-megabyte) cold
// record. Kept in sync with the matching keys in emptySession().
export function emptyHotSession() {
  return {
    reads: {},
    calls: {},
    guard: { hookMs: 0, refusals: {} },
    restate: { baseline: null }
  };
}

const HOT_FIELDS = Object.keys(emptyHotSession());

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
// Shared by the cold record and every per-session hot file, each locked by
// its own `<file>.lock` so one hook's hot write never waits on another
// session's.
function withLock(file, work) {
  const lock = `${file}.lock`;
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
    if (Date.now() > deadline) throw new Error(`savings counter locked by another hook for over ${LOCK_WAIT_MS} ms`);
    sleep(20);
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

// A session id that never became a valid file name (written before the id
// was validated, or by hand) has no hot file to remove.
function removeHotFile(sessionId) {
  try {
    fs.rmSync(hotFile(sessionId), { force: true });
  } catch {
    // not a file-name-shaped id; nothing was ever written under it
  }
}

// Catches a hot file whose cold row is already gone, such as one seeded but
// never folded back by a Stop hook.
function pruneHotFiles(now) {
  let entries;
  try {
    entries = fs.readdirSync(hotSessionsDirectory(), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.join(hotSessionsDirectory(), entry.name);
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs > SESSION_RETENTION_MS) fs.rmSync(file, { force: true });
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
      removeHotFile(sessionId);
      pruned = true;
    }
  }
  pruneHotFiles(now);
  return pruned;
}

// mutate returns true when the session changed; the record is written only
// then, or when a stale session was pruned, or the hot store held fields the
// row lacked. A row written by an older version gains the fields it lacks.
export function updateSession(sessionId, mutate) {
  return withLock(recordFile(), () => {
    const sessions = readRecord();
    const session = { ...emptySession(), ...(sessions[sessionId] ?? {}) };
    const changed = mutate(session);
    const hot = readHotSession(sessionId);
    if (hot) for (const field of HOT_FIELDS) session[field] = hot[field];
    const now = Date.now();
    const pruned = pruneSessions(sessions, now);
    if (changed || hot || pruned || sessions[sessionId] === undefined) {
      session.touched = new Date(now).toISOString();
      sessions[sessionId] = session;
      writeJson(recordFile(), sessions);
    }
    return sessions;
  });
}

// Rewrites rows no hook is touching, such as an older row read again: stale
// rows are pruned first, so mutate never brings one back, and no row's
// touched moves. mutate returns true when it changed a row.
export function updateSessions(mutate) {
  return withLock(recordFile(), () => {
    const sessions = readRecord();
    const pruned = pruneSessions(sessions, Date.now());
    const changed = mutate(sessions);
    if (changed || pruned) writeJson(recordFile(), sessions);
    return sessions;
  });
}

// The hot fields for one session, read with no lock: a torn read is
// impossible because writeJson always renames a complete file in. Missing
// file (never hit, or already folded and pruned) returns null.
export function readHotSession(sessionId) {
  return readJson(hotFile(sessionId), null);
}

function seedHotSession(sessionId) {
  const row = readRecord()[sessionId];
  const seeded = emptyHotSession();
  if (!row) return seeded;
  for (const field of HOT_FIELDS) {
    if (row[field] !== undefined) seeded[field] = row[field];
  }
  return seeded;
}

// The hook hot path: reads and rewrites one session's small file instead of
// the whole cold record. mutate returns true when it changed the session;
// the file is written then, or the first time a session is seeded, so the
// seed itself is not lost to the next read.
// Every session id with a hot file, so the report can find one with no cold
// row yet (a session the Stop hook has not folded back).
export function hotSessionIds() {
  let entries;
  try {
    entries = fs.readdirSync(hotSessionsDirectory(), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length));
}

export function updateHotSession(sessionId, mutate) {
  const file = hotFile(sessionId);
  return withLock(file, () => {
    const existing = readJson(file, null);
    const session = existing ? { ...emptyHotSession(), ...existing } : seedHotSession(sessionId);
    const changed = mutate(session);
    if (changed || !existing) writeJson(file, session);
    return session;
  });
}
