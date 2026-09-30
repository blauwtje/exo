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

// `denialFor(command, hookInput)` returns the deny reason, or null to allow.
export async function runBashGuard(denialFor) {
  try {
    const text = await readHookText();
    if (text.trim() === '') return;
    const hookInput = JSON.parse(text);
    const command = hookInput.tool_input?.command;
    if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
    if (!guardsOn()) return;
    const reason = denialFor(command, hookInput);
    if (!reason) return;
    const decision = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason };
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: decision })}\n`);
  } catch {
    // A guard fault lets the command through.
  }
}
