#!/usr/bin/env node
// PostToolUse hook on Bash: turns the start a PreToolUse step booked into a
// duration and keeps a test-like command that ran longer than the
// `heavy_after_seconds` setting in the runtime log (lib/runtime-log.mjs), so
// the heavy step wraps it from the next call. 0 switches learning off. A
// command that already matches `heavy_commands` is not recorded again. Every
// fault is swallowed: a recorder never blocks the command.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { projectOf, recordFinish } from '../lib/runtime-log.mjs';

const SEGMENT_SEPARATOR = /&&|\|\||;|\|/;

// The same match hooks/guards/heavy-command.mjs makes against `heavy_commands`.
function isListed(command) {
  const prefixes = String(settingValue('heavy_commands'))
    .split(';')
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  return command
    .split(SEGMENT_SEPARATOR)
    .map((segment) => segment.trim())
    .some((segment) => prefixes.some((prefix) => segment.startsWith(prefix)));
}

function recordRuntime(hookInput) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
  if (typeof hookInput.session_id !== 'string') return;
  const thresholdSeconds = Number(settingValue('heavy_after_seconds'));
  if (!(thresholdSeconds > 0) || isListed(command)) return;
  recordFinish({ sessionId: hookInput.session_id, command, project: projectOf(hookInput), thresholdSeconds });
}

try {
  const text = await readHookText();
  if (text.trim() !== '') recordRuntime(JSON.parse(text));
} catch {
  // A recorder fault leaves the log as it was.
}
