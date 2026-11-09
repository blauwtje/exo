import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';

const BREAKER_LIMIT = 3;
const BREAKER_COOLDOWN_MS = 60000;
const LOCK_STALE_MS = 10000;
const LOCK_RETRY_MS = 5;
const LOCK_ATTEMPTS = 2000;
const EMPTY = { hosts: {}, blocked: [] };

function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
}

function failureStatus(status) {
  return status === 429 || status >= 500;
}

function fileStore(dir) {
  const file = path.join(dir, 'host-state.json');

  function load() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return structuredClone(EMPTY);
    }
  }

  function save(state) {
    fs.mkdirSync(dir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state));
    fs.renameSync(temporary, file);
  }

  return { load, save, dir };
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dropStaleLock(lock) {
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
  } catch {
    return;
  }
}

function acquire(lock) {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      dropStaleLock(lock);
      pause(LOCK_RETRY_MS);
    }
  }
  throw new Error(`host state lock ${lock} stayed held`);
}

function withLock(dir, work) {
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'host-state.lock');
  acquire(lock);
  try {
    return work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function nextFailure(entry, now, cooldownMs) {
  const failures = (entry.failures ?? 0) + 1;
  const openUntil = failures >= BREAKER_LIMIT ? now() + cooldownMs : 0;
  return { failures, openUntil };
}

function hostEntries({ load, save, dir }) {
  function update(host, change) {
    withLock(dir, () => {
      const state = load();
      state.hosts[host] = { failures: 0, openUntil: 0, remaining: null, resetAt: 0, ...state.hosts[host], ...change(state.hosts[host] ?? {}) };
      save(state);
    });
  }

  return { update, entry: (host) => load().hosts[host] };
}

function blockedUrls({ load, save, dir }) {
  function recordBlocked(url) {
    withLock(dir, () => {
      const state = load();
      state.blocked.push(normalizeUrl(url));
      save(state);
    });
  }

  const isBlocked = (url) => load().blocked.includes(normalizeUrl(url));
  return { recordBlocked, isBlocked };
}

export function createHostState({ dir, now = Date.now, env = process.env }) {
  const cooldownMs = environmentMs('EXO_HOST_COOLDOWN_MS', BREAKER_COOLDOWN_MS, env);
  const store = fileStore(dir);
  const { update, entry } = hostEntries(store);

  function budgetWaitMs(host) {
    const found = entry(host);
    if (!found || found.remaining === null || found.remaining >= 1) return 0;
    return Math.max(found.resetAt - now(), 0);
  }

  function recordStatus(host, status) {
    update(host, (current) => (failureStatus(status) ? nextFailure(current, now, cooldownMs) : { failures: 0, openUntil: 0 }));
  }

  return {
    recordBudget: (host, { remaining, resetAt }) => update(host, () => ({ remaining, resetAt })),
    budgetWaitMs,
    recordStatus,
    isOpen: (host) => Boolean(entry(host)) && entry(host).openUntil > now(),
    ...blockedUrls(store),
  };
}
