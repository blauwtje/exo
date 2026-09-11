#!/usr/bin/env node
// Guard on Read: in PreToolUse it refuses an unbounded read of a large file so
// the model reads a located range instead, and refuses a second read of a
// range unchanged since the first in this context window; in PostToolUse it
// books the read that succeeded. Each refusal is booked under its tool call
// with the bytes it kept out of context, and each run books its own time,
// because a hook run on Read leaves no transcript entry. `readGuard: false`
// in the savings config.json switches the guard alone off; EXO_SAVINGS=off or
// `enabled: false` switches everything off.
//
//   node read-guard.mjs         PreToolUse hook on Read: stdin is the hook JSON
//   node read-guard.mjs book    PostToolUse hook on Read: stdin is the hook JSON
//   node read-guard.mjs reset   SessionStart hook on clear or compact: forgets the reads
//
// A guard fault never blocks a turn: any error exits 0 with no output, which
// lets the read through.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configFile, readJson, savingsEnabled, updateSession } from './ledger.mjs';

const UNBOUNDED_READ_CAP = 400;
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);

function guardEnabled() {
  if (!savingsEnabled()) return false;
  const config = readJson(configFile(), {});
  return config.readGuard !== false;
}

function deny(reason) {
  const output = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
  };
  process.stdout.write(JSON.stringify(output));
}

function rangeOf(input, lineCount) {
  const start = Math.max((input.offset ?? 1) - 1, 0);
  const end = input.limit === undefined ? lineCount : Math.min(start + input.limit, lineCount);
  return { start, end };
}

function describe(input) {
  if (input.offset === undefined && input.limit === undefined) return 'whole file';
  return `offset ${input.offset ?? 1}, limit ${input.limit ?? 'none'}`;
}

// A final newline ends the last line; it does not open another one.
function fileLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\n$/, '').split('\n');
}

// The file, its stat, its reader and the ledger key a hook call is about, or
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
  return { input, filePath, stat, key, reader };
}

// performance.now() counts from the start of this Node process, so the run's
// bootstrap, module loading and work are in; the spawn before it, the ledger
// write after it and the exit are not.
function bookRunTime(guard) {
  guard.hookMs = (guard.hookMs ?? 0) + performance.now();
}

// A duplicate would have returned the earlier read's bytes again; a capped
// read would have returned the whole file.
function refusalOf(session, target) {
  const { input, filePath, stat, key } = target;
  const previous = session.reads[key];
  if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
    session.guard.duplicates += 1;
    return {
      kind: 'duplicate',
      bytesWithheld: previous.bytes,
      reason: `exo read guard: ${filePath} (${describe(input)}) is unchanged since your read at ${previous.at} in this context window; use that copy, or pass a different offset and limit to read it again.`
    };
  }
  const lines = fileLines(filePath);
  const unbounded = input.offset === undefined && input.limit === undefined;
  if (!unbounded || lines.length <= UNBOUNDED_READ_CAP) return null;
  session.guard.capped += 1;
  return {
    kind: 'capped',
    bytesWithheld: Buffer.byteLength(lines.join('\n')),
    reason: `exo read guard: ${filePath} has ${lines.length} lines and an unbounded read is capped at ${UNBOUNDED_READ_CAP}; locate the range first, then read it with offset and limit, or pass limit explicitly to read more.`
  };
}

// An allowed read writes the ledger too, to book the run's time: that write
// measured 0.17 ms against a 25 ms run.
function guardRead(hookInput) {
  const target = readTarget(hookInput);
  if (target === null) return;
  let reason = null;
  updateSession(hookInput.session_id, (session) => {
    const refusal = refusalOf(session, target);
    if (refusal !== null) {
      reason = refusal.reason;
      if (typeof hookInput.tool_use_id === 'string') {
        session.guard.refusals ??= {};
        session.guard.refusals[hookInput.tool_use_id] = {
          kind: refusal.kind, bytesWithheld: refusal.bytesWithheld, reader: target.reader, filePath: target.filePath, open: true
        };
      }
    }
    bookRunTime(session.guard);
    return true;
  });
  if (reason !== null) deny(reason);
}

// PostToolUse runs only after the tool succeeded, so the range is booked as
// held by the context window from here on.
function book(hookInput) {
  const target = readTarget(hookInput);
  if (target === null) return;
  const { input, filePath, stat, key, reader } = target;
  const lines = fileLines(filePath);
  const { start, end } = rangeOf(input, lines.length);
  const bytes = Buffer.byteLength(lines.slice(start, end).join('\n'));
  updateSession(hookInput.session_id, (session) => {
    session.reads[key] = { mtimeMs: stat.mtimeMs, size: stat.size, bytes, at: new Date().toISOString() };
    // The same reader reading a capped file again, in the same context window,
    // takes back part of what the refusal kept out, never more than all of it:
    // overlapping reads or a re-read after an edit are the model's own work.
    for (const refusal of Object.values(session.guard.refusals ?? {})) {
      const sameFile = refusal.reader === reader && refusal.filePath === filePath;
      if (refusal.open && refusal.kind === 'capped' && sameFile) refusal.bytesWithheld = Math.max(refusal.bytesWithheld - bytes, 0);
    }
    bookRunTime(session.guard);
    return true;
  });
}

// A clear or a compaction ends the context window every open refusal was about.
function reset(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => {
    session.reads = {};
    for (const refusal of Object.values(session.guard.refusals ?? {})) refusal.open = false;
    return true;
  });
}

try {
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (process.argv[2] === 'reset') reset(hookInput);
  else if (process.argv[2] === 'book') book(hookInput);
  else guardRead(hookInput);
} catch (error) {
  console.error(`read-guard: ${error.message}`);
}
