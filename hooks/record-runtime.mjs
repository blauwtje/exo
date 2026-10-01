#!/usr/bin/env node
// PostToolUse hook on Bash: consumes the start a PreToolUse step booked, takes
// the run's `duration_ms` from the hook input (time since the start without it),
// and keeps a test-like command that ran longer than the
// `heavy_after_seconds` setting in the runtime log (lib/runtime-log.mjs), so
// the heavy step wraps it from the next call. 0 switches learning off. A
// command that already matches `heavy_commands` is not recorded again. Every
// fault is swallowed: a recorder never blocks the command.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { isListedHeavy } from './guards/heavy-command.mjs';
import { projectOf, recordFinish } from '../lib/runtime-log.mjs';

function recordRuntime(hookInput) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
  if (typeof hookInput.session_id !== 'string') return;
  const thresholdSeconds = Number(settingValue('heavy_after_seconds'));
  if (!(thresholdSeconds > 0) || isListedHeavy(command)) return;
  recordFinish({
    sessionId: hookInput.session_id,
    command,
    project: projectOf(hookInput),
    thresholdSeconds,
    durationMs: hookInput.duration_ms
  });
}

try {
  const text = await readHookText();
  if (text.trim() !== '') recordRuntime(JSON.parse(text));
} catch {
  // A recorder fault leaves the log as it was.
}
