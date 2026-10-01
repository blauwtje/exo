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
import { innerCommands } from './inner-commands.mjs';

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

// How many `bash -c` or `eval` strings deep a guard looks.
const INNER_DEPTH = 3;

// The deny reason (a string) for the string arguments of `bash -c` and `eval`
// in `command`, each judged as a command of its own, the first denial winning;
// an inner rewrite is not applied. Ceiling: nesting past INNER_DEPTH passes.
function innerDenial(command, hookInput, denialFor, depth) {
  if (depth > INNER_DEPTH) return null;
  for (const inner of innerCommands(command)) {
    const innerInput = { ...hookInput, tool_input: { ...hookInput.tool_input, command: inner } };
    const reason = denialFor(inner, innerInput);
    if (typeof reason === 'string' && reason !== '') return reason;
    const deeper = innerDenial(inner, hookInput, denialFor, depth + 1);
    if (deeper !== null) return deeper;
  }
  return null;
}

// The output for `hookInput` when `denialFor(command, hookInput)` returns a
// reason, which denies, or `{ updatedCommand }`, which runs that command in
// place of the original, or null to allow: a call that is not a Bash command,
// or the `guards` setting off, allows. A `bash -c` or `eval` string argument
// is judged too, and a denial there denies the whole command.
export function guardDecision(hookInput, denialFor) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return null;
  if (!guardsOn()) return null;
  let reason = denialFor(command, hookInput);
  if (typeof reason !== 'string' || reason === '') reason = innerDenial(command, hookInput, denialFor, 1) ?? reason;
  if (!reason) return null;
  if (typeof reason === 'object') {
    const updatedInput = { ...hookInput.tool_input, command: reason.updatedCommand };
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } };
  }
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
