#!/usr/bin/env node
// Guard on Bash, Edit, WebFetch and WebSearch: in PreToolUse it denies the
// second identical fetch URL or search query, and otherwise the third identical call in
// one context window, so a session that re-runs a failing command or applies
// the same edit again changes an input or stops. Identical is the normalised
// command string, or the file path with a hash of the text the edit replaces;
// nothing else is compared, because a smarter match would deny a legitimate
// retry. In PostToolUse, which runs only after the tool succeeded, an Edit or
// Write starts that reader's command counts over, because a test run after a
// change is a new run while a failed edit changed nothing. The counts live in
// the session store; the `guards` setting off switches the guard off.
//
//   node repeat-guard.mjs         PreToolUse hook on Bash, Edit, WebFetch and WebSearch: stdin is the hook JSON
//   node repeat-guard.mjs edited  PostToolUse hook on Edit and Write: forgets the reader's commands
//   node repeat-guard.mjs reset   SessionStart hook on clear or compact: forgets the calls
//
// The limit it accepts: a command a session legitimately runs three times in
// one window, such as a status check, is denied too; the `guards` setting off
// lifts that.
//
// A guard fault never blocks a turn: any error exits 0 with no output, which
// lets the call through. A failed read of stdin exits 1, a non-blocking error
// the harness logs and shows in verbose mode; the guard never exits 2.

import crypto from 'node:crypto';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { updateSession } from '#session-store';
import { settingValue } from '#settings-store';
import { isMain } from '#script-flags';

// The first repeat passes; the attempt after it is denied.
const DENY_AT = 3;
const WEB_DENY_AT = 2;

// A setting that cannot be read leaves the guard on.
function guardEnabled() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

function denial(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

// A log file is the one part of a command a session is expected to vary while
// the work stays the same, so the redirect goes before the comparison.
function normalizeCommand(command) {
  const withoutLog = command.replace(/>>?\s*"?[^\s"']*\.log"?/g, '');
  return withoutLog.replace(/\s+/g, ' ').trim();
}

function digest(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// A delegate shares the session id but not the context window, so each
// agent's calls are counted apart from the main thread's.
function readerOf(hookInput) {
  return typeof hookInput.agent_id === 'string' ? hookInput.agent_id : 'main';
}

// The call this hook run is about, or null when the guard has nothing to say
// about it.
function callTarget(hookInput) {
  if (!guardEnabled()) return null;
  if (typeof hookInput.session_id !== 'string') return null;
  const input = hookInput.tool_input ?? {};
  const reader = readerOf(hookInput);
  if (hookInput.tool_name === 'Bash' && typeof input.command === 'string') {
    const command = normalizeCommand(input.command);
    if (command === '') return null;
    return { tool: 'Bash', reader, filePath: null, key: `${reader}:Bash:${digest(command)}` };
  }
  if (hookInput.tool_name === 'Edit' && typeof input.file_path === 'string' && typeof input.old_string === 'string') {
    return { tool: 'Edit', reader, filePath: input.file_path, key: `${reader}:Edit:${input.file_path}:${digest(input.old_string)}` };
  }
  if (hookInput.tool_name === 'WebFetch' && typeof input.url === 'string' && input.url.trim() !== '') {
    return { tool: 'WebFetch', reader, filePath: null, key: `${reader}:WebFetch:${digest(input.url.trim())}` };
  }
  if (hookInput.tool_name === 'WebSearch' && typeof input.query === 'string') {
    const query = input.query.replace(/\s+/g, ' ').trim();
    if (query === '') return null;
    return { tool: 'WebSearch', reader, filePath: null, key: `${reader}:WebSearch:${digest(query)}` };
  }
  return null;
}

// A page or a result list does not change between two calls in one window, so
// a web call is denied at its first repeat; the fetch prompt is not compared,
// because a second question about a page is answered from the first fetch.
function denyAt(tool) {
  return tool === 'WebFetch' || tool === 'WebSearch' ? WEB_DENY_AT : DENY_AT;
}

// The reason names the count and what to change: a denial the model cannot
// act on is answered with the same call again.
function reasonFor(target, attempts) {
  if (target.tool === 'Bash') {
    return `exo repeat guard: this command has already run ${attempts - 1} times unchanged in this context window; change an input, read the output you already have, or stop.`;
  }
  if (target.tool === 'WebFetch') {
    return 'exo repeat guard: you already fetched this URL once in this context window, and a failed fetch counts; answer from that fetch, fetch another page, or record the gap under Uncertainties.';
  }
  if (target.tool === 'WebSearch') {
    return 'exo repeat guard: you already searched this query once in this context window; use those results, change the query, or record the gap under Uncertainties.';
  }
  return `exo repeat guard: this edit has already replaced the same text in ${target.filePath} ${attempts - 1} times in this context window; read the file as it stands before editing it again, or stop.`;
}

export function guardCall(hookInput) {
  const target = callTarget(hookInput);
  if (target === null) return null;
  let reason = null;
  updateSession(hookInput.session_id, (session) => {
    const attempts = (session.calls[target.key] ?? 0) + 1;
    session.calls[target.key] = attempts;
    if (attempts >= denyAt(target.tool)) reason = reasonFor(target, attempts);
    return true;
  });
  return reason === null ? null : denial(reason);
}

// Only the reader that changed a file forgets its commands: another agent's
// runs saw none of that change.
export function edited(hookInput) {
  if (!guardEnabled()) return null;
  if (typeof hookInput.session_id !== 'string') return null;
  const prefix = `${readerOf(hookInput)}:Bash:`;
  updateSession(hookInput.session_id, (session) => {
    for (const key of Object.keys(session.calls)) {
      if (key.startsWith(prefix)) delete session.calls[key];
    }
    return true;
  });
  return null;
}

// A clear or a compaction ends the context window the counts were about.
export function reset(hookInput) {
  if (typeof hookInput.session_id !== 'string') return null;
  updateSession(hookInput.session_id, (session) => {
    session.calls = {};
    return true;
  });
  return null;
}

if (isMain(import.meta.url)) {
  let inputText;
  try {
    inputText = await readHookText();
  } catch (error) {
    console.error(`repeat-guard: could not read hook input: ${error.message}`);
    process.exitCode = 1;
  }
  if (inputText !== undefined) {
    try {
      const hookInput = JSON.parse(inputText);
      const handlers = { reset, edited };
      const output = (handlers[process.argv[2]] ?? guardCall)(hookInput);
      if (output !== null) process.stdout.write(JSON.stringify(output));
    } catch (error) {
      console.error(`repeat-guard: ${error.message}`);
    }
  }
}
