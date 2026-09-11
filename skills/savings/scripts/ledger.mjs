// The savings ledger on disk: one JSON file keyed by session id under the
// config directory, written through a rename so a status line render never
// reads a half file. Shared by savings.mjs (tokens, lines, cost, time) and
// read-guard.mjs (reads withheld).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function configDirectory() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function ledgerDirectory() {
  return path.join(configDirectory(), 'exo', 'savings');
}

export function ledgerFile() {
  return path.join(ledgerDirectory(), 'sessions.json');
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, file);
}

export function emptySession() {
  return {
    started: null,
    updated: null,
    model: null,
    rightSized: false,
    costUsd: null,
    durationMs: null,
    tokens: null,
    lines: null,
    offsets: {},
    usageById: {},
    linesByEntry: {},
    reads: {},
    guard: { capped: 0, duplicates: 0, bytesWithheld: 0 }
  };
}

// mutate returns true when the session changed; the ledger is written only
// then. A row written by an older version gains the fields it lacks.
export function updateSession(sessionId, mutate) {
  const sessions = readJson(ledgerFile(), {});
  const session = { ...emptySession(), ...(sessions[sessionId] ?? {}) };
  const changed = mutate(session);
  if (changed || sessions[sessionId] === undefined) {
    sessions[sessionId] = session;
    writeJson(ledgerFile(), sessions);
  }
  return sessions;
}
