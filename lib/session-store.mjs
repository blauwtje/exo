// The guards' per-session state: `<config>/exo/sessions/<id>.json`, one
// `{ reads, calls }` object per session, written through a rename and updated
// behind a directory lock so two hooks firing at once lose nothing. A session
// file starts empty, and every write prunes files older than 30 days and
// locks left by a hook that died.
// Imported as `#session-store`.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sessionFile, sessionsDirectory } from '#session-record-path';

// Every hook in hooks/hooks.json times out after 10 s, so a lock older than
// LOCK_STALE_MS outlived any hook and belongs to one that died, and a waiter
// gives up before its own hook's timeout kills it mid-write.
const LOCK_WAIT_MS = 8000;
const LOCK_STALE_MS = 15000;
const SESSION_RETENTION_DAYS = 30;
const SESSION_RETENTION_MS = SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function emptySession() {
  return { reads: {}, calls: {} };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, file);
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
    if (Date.now() > deadline) throw new Error(`session store locked by another hook for over ${LOCK_WAIT_MS} ms`);
    sleep(20);
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

// A `<id>.json.lock` directory left by a hook killed mid-write is removed once
// it outlives LOCK_STALE_MS, because withLock only takes a stale lock over on
// the next call for that same id, which never comes once the session ended.
function pruneSessionFiles(now) {
  let entries;
  try {
    entries = fs.readdirSync(sessionsDirectory(), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(sessionsDirectory(), entry.name);
    const isLock = entry.isDirectory() && entry.name.endsWith('.json.lock');
    const isSession = entry.isFile() && entry.name.endsWith('.json');
    if (!isLock && !isSession) continue;
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    const limit = isLock ? LOCK_STALE_MS : SESSION_RETENTION_MS;
    if (now - mtimeMs > limit) fs.rmSync(full, { recursive: true, force: true });
  }
}

// mutate returns true when it changed the session; the file is written then,
// or the first time a session is seen, so the empty seed is not lost. A throw
// on an invalid session id is the caller's to catch: a hook exits 0 on it.
export function updateSession(sessionId, mutate) {
  const file = sessionFile(sessionId);
  return withLock(file, () => {
    const existing = readJson(file, null);
    const session = { ...emptySession(), ...existing };
    const changed = mutate(session);
    if (changed || !existing) writeJson(file, session);
    pruneSessionFiles(Date.now());
    return session;
  });
}
