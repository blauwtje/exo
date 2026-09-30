// Runs one PreToolUse guard on Bash: reads the hook input, skips a call that
// is not a Bash command, stands down when the `guards` setting is off, and
// writes the deny decision `denialFor` returns. A fault while reading or
// parsing the input, or inside `denialFor`, exits 0 with no output, so the
// command goes through. A `guards` setting that cannot be read leaves the
// guard on, because a safety guard that a broken settings file switches off
// would fail open.

import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';

function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

// True when the module at `moduleUrl` is the process entry, so a guard file
// imported by another module defines `denialFor` without reading stdin.
export function isProcessEntry(moduleUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

// The deny output for `hookInput` when `denialFor(command, hookInput)` returns
// a reason, or null to allow: a call that is not a Bash command, or the
// `guards` setting off, allows.
export function guardDecision(hookInput, denialFor) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return null;
  if (!guardsOn()) return null;
  const reason = denialFor(command, hookInput);
  if (!reason) return null;
  const decision = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason };
  return { hookSpecificOutput: decision };
}

export async function runBashGuard(denialFor) {
  try {
    const text = await readHookText();
    if (text.trim() === '') return;
    const output = guardDecision(JSON.parse(text), denialFor);
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // A guard fault lets the command through.
  }
}
