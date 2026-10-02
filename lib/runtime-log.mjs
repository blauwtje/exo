// The runtime log the heavy-run learning reads and writes: `runtimes.json`
// under the heavy cache root. It holds
//   learned: { <project directory>: { <command text>: { seconds, lastUsed } } }
//   durations: { <project directory>: { <whole-suite key>: { seconds, lastUsed } } }
//   starts:  { <session id>: { <command text>: <start time in ms> } }
// A PreToolUse step books a start; the PostToolUse hook hooks/record-runtime.mjs
// consumes it and keeps a test-like command that ran longer than the threshold.
// The duration is the hook input's `duration_ms`, which Claude Code documents as
// tool execution time excluding permission prompts and PreToolUse hooks; the
// start only marks the call as one to measure. PreToolUse fires before the
// permission prompt, so the time since the start would count a slow approval.
// Ceiling: `duration_ms` is optional; without it the duration falls back to the
// time since the start, which includes any permission wait. `seconds` is the last duration over the threshold. A later
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
// Launchers skipped to reach the program a segment runs: `npm run check` runs `check`.
const LAUNCHERS = new Set(['npx', 'pnpm', 'yarn', 'npm', 'bun', 'bunx', 'make', 'uv', 'poetry', 'python', 'python3', 'run', 'exec', '-m']);
// Programs whose result depends on remote state (CI, a server, a registry), not
// on the code, so a cached green run would replay a stale answer.
const REMOTE_PROGRAMS = new Set(['gh', 'curl', 'wget', 'http', 'https', 'ssh', 'scp', 'kubectl', 'helm', 'aws', 'gcloud', 'az', 'docker', 'nc', 'ping', 'git']);
// Words that join a launcher to its script and so leave the whole-suite key: `npm run test` is `npm test`.
const KEY_FILLER = new Set(['run', 'exec', '-m']);
// A redirection and its target: `> file`, `>> file`, `2>&1`, `&> file`.
const REDIRECTION = /&?\d*>>?&?\s*\S+/g;
const ENV_ASSIGNMENT = /^\w+=/;
// A script or subcommand name, not a path, URL or option.
const BARE_NAME = /^[\w:.-]+$/;
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

// The index of the first word past env assignments and a `time` prefix with
// its options: `CI=1 time -p npm test` starts at `npm`.
// Ceiling: an option that takes a value, as in `time -f %e`, leaves the value as
// the program.
function commandStart(words) {
  let index = 0;
  for (;;) {
    while (index < words.length && ENV_ASSIGNMENT.test(words[index])) index += 1;
    if (words[index] !== 'time') return index;
    index += 1;
    while (index < words.length && words[index].startsWith('-')) index += 1;
  }
}

// The program a shell segment runs and its first argument, past env
// assignments, a `time` prefix and launchers: `CI=1 npx eslint .` gives ['eslint', '.'].
function leadingWords(segment) {
  const words = segment.trim().split(/\s+/);
  let index = commandStart(words);
  while (index < words.length - 1 && LAUNCHERS.has(words[index])) index += 1;
  return words.slice(index, index + 2);
}

// True for a command worth learning: a segment whose program or script name is
// test-like, no segment that reads remote state, and not a watch, UI or dev
// mode, an install, deploy or build, a forced run, or a wait loop or sleep.
export function isLearnable(command) {
  if (NEVER_LEARNED.test(command)) return false;
  const segments = command.split(/\|\|?|&&|;/).map(leadingWords);
  if (segments.some(([program]) => REMOTE_PROGRAMS.has(program))) return false;
  return segments.some((words) => words.some((word) => BARE_NAME.test(word) && TEST_LIKE.test(word)));
}

// The key of a segment that runs the whole suite, else null: a learnable segment
// that, past env assignments, a `time` prefix, launchers and its test-like
// word, carries only options and launcher words. The key is its words without
// env assignments, the `time` prefix, options and `run`-style fillers, so
// `npm test`, `npm run test`, `time npm test` and `npm test > log` share the key `npm test`.
function wholeSuiteKey(segment) {
  const text = segment.replace(REDIRECTION, ' ');
  if (!isLearnable(text)) return null;
  const allWords = text.trim().split(/\s+/);
  const words = allWords.slice(commandStart(allWords)).filter((word) => !ENV_ASSIGNMENT.test(word));
  let start = 0;
  while (start < words.length - 1 && LAUNCHERS.has(words[start])) start += 1;
  const testIndex = words.findIndex((word, index) => index >= start && index < start + 2 && BARE_NAME.test(word) && TEST_LIKE.test(word));
  if (testIndex === -1) return null;
  const narrowing = words.slice(testIndex + 1).some((word) => !word.startsWith('-') && !LAUNCHERS.has(word));
  if (narrowing) return null;
  return words.filter((word) => !word.startsWith('-') && !KEY_FILLER.has(word)).join(' ');
}

// The keys of the segments of `command` that run the whole suite, in order.
export function wholeSuiteKeys(command) {
  return command.split(/\|\|?|&&|;/).map(wholeSuiteKey).filter((key) => key !== null);
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
    return { learned: log.learned ?? {}, durations: log.durations ?? {}, starts: log.starts ?? {} };
  } catch {
    return { learned: {}, durations: {}, starts: {} };
  }
}

function pruneOlderThan(entries, cutoff, timeOf) {
  for (const key of Object.keys(entries)) {
    if (timeOf(entries[key]) < cutoff) delete entries[key];
  }
}

function writeLog(log, now) {
  const cutoff = now - FORGET_AFTER_MS;
  for (const table of [log.learned, log.durations]) {
    for (const project of Object.keys(table)) {
      pruneOlderThan(table[project], cutoff, (entry) => Date.parse(entry.lastUsed));
      if (Object.keys(table[project]).length === 0) delete table[project];
    }
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
// run under the threshold that left no entry to refresh. `durationMs`, the
// tool's own run time, is the duration when given; else the time since the start.
export function recordFinish({ sessionId, command, project, thresholdSeconds, durationMs, now = Date.now() }) {
  const log = readLog();
  const startedAt = log.starts[sessionId]?.[command];
  if (startedAt === undefined) return null;
  delete log.starts[sessionId][command];
  const measured = Number.isFinite(durationMs) && durationMs >= 0;
  const seconds = (measured ? durationMs : now - startedAt) / 1000;
  const keys = wholeSuiteKeys(command);
  if (keys.length === 1) {
    log.durations[project] ??= {};
    log.durations[project][keys[0]] = { seconds, lastUsed: new Date(now).toISOString() };
  }
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

// Marks a learned command, and the whole-suite duration kept for it, as used
// now, so a wrapped run, which books no start, keeps both from the 30-day drop.
export function touchLearned({ project, command, now = Date.now() }) {
  const log = readLog();
  const entry = log.learned[project]?.[command];
  if (!entry) return;
  const usedAt = new Date(now).toISOString();
  entry.lastUsed = usedAt;
  const keys = wholeSuiteKeys(command);
  const duration = keys.length === 1 ? log.durations[project]?.[keys[0]] : undefined;
  if (duration) duration.lastUsed = usedAt;
  writeLog(log, now);
}

// The learned commands of `project` with their last long duration in seconds.
export function learnedCommands(project) {
  return readLog().learned[project] ?? {};
}

// The last duration in seconds of the whole-suite `key` in `project`, or null
// when none is recorded.
export function lastDuration(project, key) {
  return readLog().durations[project]?.[key]?.seconds ?? null;
}
