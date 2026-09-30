#!/usr/bin/env node
// Guard on Read: in PreToolUse it refuses an unbounded read of a large file, one
// without a limit at or under the cap, so the model reads a located range
// instead, except the repository map, which is
// generated and capped where it is written, and refuses a second read of a
// range unchanged since the first in this context window; in PostToolUse it
// books the read that succeeded in the session store. The `guards` setting
// off switches the guard off, and the `guard-lines` setting sets how many
// lines make a file large.
//
//   node read-guard.mjs         PreToolUse hook on Read: stdin is the hook JSON
//   node read-guard.mjs book    PostToolUse hook on Read: stdin is the hook JSON
//   node read-guard.mjs reset   SessionStart hook on clear or compact: forgets the reads
//
// A guard fault never blocks a turn: any error exits 0 with no output, which
// lets the read through. A failed read of stdin exits 1, a non-blocking error
// the harness logs and shows in verbose mode; the guard never exits 2.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { HOOK_INPUT_TIMEOUT_MS, readHookText } from '#hook-input';
import { memoryDirectory } from '#memory-store';
import { environmentMs } from '#script-flags';
import { updateSession } from '#session-store';
import { SCHEMA, settingValue } from '#settings-store';

const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);

const MAP_NAME = 'map.md';

const DEFAULT_GUARD_LINES = SCHEMA['guard-lines'].default;

// A path a symlink reaches is the same file, and git reports the exo directory
// with the links resolved; a directory that cannot be resolved compares as it
// was given.
function resolvedDirectory(directory) {
  try {
    return fs.realpathSync(directory);
  } catch {
    return directory;
  }
}

// The repository map skills/spec/scripts/repo-map.mjs writes is generated,
// held to its own cap and printed to be read whole, so the line cap does not
// apply to it. Only that one file is exempt: the exo directory comes from git,
// so a map.md in a tracked folder named exo stays capped.
function isRepositoryMap(filePath, cwd) {
  if (path.basename(filePath) !== MAP_NAME) return false;
  const read = resolvedDirectory(path.dirname(path.resolve(filePath)));
  return read === resolvedDirectory(memoryDirectory(cwd));
}

// A setting that cannot be read leaves the guard on, with the default limit.
function guardEnabled() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

// A value that is not a whole number of at least 1 keeps the default, so a
// broken hand edit never switches the guard off.
function guardLines() {
  try {
    const configured = settingValue('guard-lines');
    if (Number.isSafeInteger(configured) && configured >= 1) return configured;
  } catch {
    // an unreadable setting keeps the default
  }
  return DEFAULT_GUARD_LINES;
}

function deny(reason) {
  const output = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
  };
  process.stdout.write(JSON.stringify(output));
}

function describe(input) {
  if (input.offset === undefined && input.limit === undefined) return 'whole file';
  return `offset ${input.offset ?? 1}, limit ${input.limit ?? 'none'}`;
}

// A final newline ends the last line; it does not open another one.
function fileLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\n$/, '').split('\n');
}

// The file, its stat, its reader and the record key a hook call is about, or
// null when the guard has nothing to say about this call.
function readTarget(hookInput) {
  if (!guardEnabled()) return null;
  if (typeof hookInput.session_id !== 'string') return null;
  const input = hookInput.tool_input ?? {};
  const filePath = input.file_path;
  if (typeof filePath !== 'string' || BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  // A delegate shares the session id but not the context window, so each
  // agent's reads are tracked apart from the main thread's.
  const reader = typeof hookInput.agent_id === 'string' ? hookInput.agent_id : 'main';
  const key = `${reader}:${filePath}:${input.offset ?? 0}:${input.limit ?? 0}`;
  const cwd = typeof hookInput.cwd === 'string' && hookInput.cwd !== '' ? hookInput.cwd : process.cwd();
  return { input, filePath, stat, key, reader, cwd };
}

function refusalOf(session, target) {
  const { input, filePath, stat, key, cwd } = target;
  const previous = session.reads[key];
  if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
    return {
      reason: `exo read guard: ${filePath} (${describe(input)}) is unchanged since your read at ${previous.at} in this context window; use that copy, or pass a different offset and limit to read it again.`
    };
  }
  // An offset alone or a limit above the cap bounds nothing the cap protects,
  // so only a limit at or under the cap makes a read bounded.
  const lineLimit = guardLines();
  const bounded = input.limit !== undefined && input.limit <= lineLimit;
  if (bounded) return null;
  if (isRepositoryMap(filePath, cwd)) return null;
  const lines = fileLines(filePath);
  if (lines.length <= lineLimit) return null;
  return {
    reason: `exo read guard: ${filePath} has ${lines.length} lines and an unbounded read is capped at ${lineLimit}; locate the range first, then read it with offset and a limit of at most ${lineLimit}.`
  };
}

function guardRead(hookInput) {
  const target = readTarget(hookInput);
  if (target === null) return;
  let reason = null;
  updateSession(hookInput.session_id, (session) => {
    reason = refusalOf(session, target)?.reason ?? null;
    return false;
  });
  if (reason !== null) deny(reason);
}

// PostToolUse runs only after the tool succeeded, so the range is booked as
// held by the context window from here on.
function book(hookInput) {
  const target = readTarget(hookInput);
  if (target === null) return;
  const { stat, key } = target;
  updateSession(hookInput.session_id, (session) => {
    session.reads[key] = { mtimeMs: stat.mtimeMs, size: stat.size, at: new Date().toISOString() };
    return true;
  });
}

// A clear or a compaction ends the context window the reads were about.
function reset(hookInput) {
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => {
    session.reads = {};
    return true;
  });
}

let inputText;
try {
  // EXO_READ_GUARD_INPUT_MS shortens the stdin wait for a test.
  inputText = await readHookText({ timeoutMs: environmentMs('EXO_READ_GUARD_INPUT_MS', HOOK_INPUT_TIMEOUT_MS) });
} catch (error) {
  console.error(`read-guard: could not read hook input: ${error.message}`);
  process.exitCode = 1;
}
if (inputText !== undefined) {
  try {
    const hookInput = JSON.parse(inputText);
    if (process.argv[2] === 'reset') reset(hookInput);
    else if (process.argv[2] === 'book') book(hookInput);
    else guardRead(hookInput);
  } catch (error) {
    console.error(`read-guard: ${error.message}`);
  }
}
