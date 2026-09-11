#!/usr/bin/env node
// PreToolUse guard on Read: refuses an unbounded read of a large file so the
// model reads a located range instead, refuses a second read of a range
// unchanged since the first in this context window, and books the bytes
// withheld into the ledger as a measured saving. Always on; `readGuard: false`
// in the savings config.json is the only switch.
//
//   node read-guard.mjs         PreToolUse hook on Read: stdin is the hook JSON
//   node read-guard.mjs reset   SessionStart hook on clear or compact: forgets the reads
//
// A guard fault never blocks a turn: any error exits 0 with no output, which
// lets the read through.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ledgerDirectory, readJson, updateSession } from './ledger.mjs';

const UNBOUNDED_READ_CAP = 400;
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);

function guardEnabled() {
  const config = readJson(path.join(ledgerDirectory(), 'config.json'), {});
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

function guardRead(hookInput) {
  if (!guardEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  const input = hookInput.tool_input ?? {};
  const filePath = input.file_path;
  if (typeof filePath !== 'string' || BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  if (!stat.isFile()) return;
  // A delegate shares the session id but not the context window, so each
  // agent's reads are tracked apart from the main thread's.
  const reader = typeof hookInput.agent_id === 'string' ? hookInput.agent_id : 'main';
  const key = `${reader}:${filePath}:${input.offset ?? 0}:${input.limit ?? 0}`;
  let reason = null;
  updateSession(hookInput.session_id, (session) => {
    const previous = session.reads[key];
    if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
      session.guard.duplicates += 1;
      session.guard.bytesWithheld += previous.bytes;
      reason = `exo read guard: ${filePath} (${describe(input)}) is unchanged since your read at ${previous.at} in this context window; use that copy, or pass a different offset and limit to read it again.`;
      return true;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    // A final newline ends the last line; it does not open another one.
    const lines = content.replace(/\n$/, '').split('\n');
    const unbounded = input.offset === undefined && input.limit === undefined;
    if (unbounded && lines.length > UNBOUNDED_READ_CAP) {
      session.guard.capped += 1;
      session.guard.bytesWithheld += Buffer.byteLength(lines.slice(UNBOUNDED_READ_CAP).join('\n'));
      reason = `exo read guard: ${filePath} has ${lines.length} lines and an unbounded read is capped at ${UNBOUNDED_READ_CAP}; locate the range first, then read it with offset and limit, or pass limit explicitly to read more.`;
      return true;
    }
    const { start, end } = rangeOf(input, lines.length);
    session.reads[key] = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      bytes: Buffer.byteLength(lines.slice(start, end).join('\n')),
      at: new Date().toISOString()
    };
    return true;
  });
  if (reason !== null) deny(reason);
}

function reset(hookInput) {
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => {
    session.reads = {};
    return true;
  });
}

try {
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (process.argv[2] === 'reset') reset(hookInput);
  else guardRead(hookInput);
} catch (error) {
  console.error(`read-guard: ${error.message}`);
}
