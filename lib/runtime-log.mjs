// The runtime log the heavy-run learning reads and writes: `runtimes.json`
// under the heavy cache root. It holds
//   learned: { <project directory>: { <command text>: { seconds, lastUsed } } }
//   starts:  { <session id>: { <command text>: <start time in ms> } }
// A PreToolUse step books a start; the PostToolUse hook hooks/record-runtime.mjs
// turns it into a duration and keeps a test-like command that ran longer than
// the threshold. `seconds` is the last duration over the threshold. A later
// fast run, or a wrapped run the heavy step marks with `touchLearned`, refreshes
// `lastUsed` and leaves the command learned. An entry or start unused for 30
// days is dropped on the next write.
// Ceiling: a write reads the file, changes it and renames a temporary file over
// it, so two sessions writing in the same instant can lose one record; lift it
// with a lock like the one in hooks/heavy-run.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const FILE_NAME = 'runtimes.json';
const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// `check` matches at a word start and not as `checkout`, so `git checkout` stays out.
const TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/;
// A mode that never finishes (its lock would block other sessions), a command
// that is not a test run, a forced run, which the wrapper must not cache, and a
// wait loop or sleep, whose cached result would replay a stale poll as a pass.
const NEVER_LEARNED = /--watch|--ui|--headed| dev| serve| start|install|deploy|\bbuild|EXO_HEAVY_FORCE|\b(until|while|sleep)\b/;

// The same root hooks/heavy-run.mjs resolves; that file runs at module scope,
// so the three lines are repeated here rather than imported.
function cacheRoot() {
  if (process.env.EXO_HEAVY_CACHE) return process.env.EXO_HEAVY_CACHE;
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'exo', 'heavy');
}

export function runtimeFile() {
  return path.join(cacheRoot(), FILE_NAME);
}

// True for a command worth learning: test-like and not a watch, UI or dev mode,
// an install, deploy or build, a forced run, or a wait loop or sleep.
export function isLearnable(command) {
  return TEST_LIKE.test(command) && !NEVER_LEARNED.test(command);
}

// The project a hook call belongs to: CLAUDE_PROJECT_DIR, else the call's cwd.
export function projectOf(hookInput) {
  return process.env.CLAUDE_PROJECT_DIR || hookInput.cwd;
}

// A missing or unreadable file is an empty log, so a broken file is rebuilt by
// the next write rather than blocking every call.
function readLog() {
  try {
    const log = JSON.parse(fs.readFileSync(runtimeFile(), 'utf8'));
    return { learned: log.learned ?? {}, starts: log.starts ?? {} };
  } catch {
    return { learned: {}, starts: {} };
  }
}

function pruneOlderThan(entries, cutoff, timeOf) {
  for (const key of Object.keys(entries)) {
    if (timeOf(entries[key]) < cutoff) delete entries[key];
  }
}

function writeLog(log, now) {
  const cutoff = now - FORGET_AFTER_MS;
  for (const project of Object.keys(log.learned)) {
    pruneOlderThan(log.learned[project], cutoff, (entry) => Date.parse(entry.lastUsed));
    if (Object.keys(log.learned[project]).length === 0) delete log.learned[project];
  }
  for (const session of Object.keys(log.starts)) {
    pruneOlderThan(log.starts[session], cutoff, (startedAt) => startedAt);
    if (Object.keys(log.starts[session]).length === 0) delete log.starts[session];
  }
  const file = runtimeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(log)}\n`);
  fs.renameSync(temporary, file);
}

export function recordStart({ sessionId, command, now = Date.now() }) {
  const log = readLog();
  log.starts[sessionId] ??= {};
  log.starts[sessionId][command] = now;
  writeLog(log, now);
}

// Consumes the start of `command` in `sessionId` and returns the learned entry
// the run left, or null: no start booked, a command not worth learning, or a
// run under the threshold that left no entry to refresh.
export function recordFinish({ sessionId, command, project, thresholdSeconds, now = Date.now() }) {
  const log = readLog();
  const startedAt = log.starts[sessionId]?.[command];
  if (startedAt === undefined) return null;
  delete log.starts[sessionId][command];
  const seconds = (now - startedAt) / 1000;
  const projectEntries = log.learned[project] ?? {};
  const known = projectEntries[command];
  let entry = null;
  if (isLearnable(command) && thresholdSeconds > 0) {
    if (seconds > thresholdSeconds) entry = { seconds, lastUsed: new Date(now).toISOString() };
    else if (known) entry = { seconds: known.seconds, lastUsed: new Date(now).toISOString() };
  }
  if (entry) {
    projectEntries[command] = entry;
    log.learned[project] = projectEntries;
  }
  writeLog(log, now);
  return entry;
}

// Marks a learned command as used now, so a wrapped run, which books no start,
// keeps it from the 30-day drop.
export function touchLearned({ project, command, now = Date.now() }) {
  const log = readLog();
  const entry = log.learned[project]?.[command];
  if (!entry) return;
  entry.lastUsed = new Date(now).toISOString();
  writeLog(log, now);
}

// The learned commands of `project` with their last long duration in seconds.
export function learnedCommands(project) {
  return readLog().learned[project] ?? {};
}
