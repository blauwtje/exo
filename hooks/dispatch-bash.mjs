#!/usr/bin/env node
// The one PreToolUse hook on Bash: runs the three guards in one process, each
// in its own try/catch, and returns the first deny. `guards` `off` stands them
// down; an unreadable setting leaves them on. An unreadable input exits 0 with
// no output.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { isMain } from '../lib/script-flags.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { innerCommands } from './guards/inner-commands.mjs';
import { denialFor as secretDenial } from './guards/secret-guard.mjs';

// How many `bash -c` or `eval` strings deep a guard looks; deeper passes.
const INNER_DEPTH = 3;

function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

function innerDenial(command, hookInput, denialFor, depth) {
  if (depth > INNER_DEPTH) return null;
  for (const inner of innerCommands(command)) {
    const reason = denialFor(inner, { ...hookInput, tool_input: { ...hookInput.tool_input, command: inner } })
      || innerDenial(inner, hookInput, denialFor, depth + 1);
    if (reason) return reason;
  }
  return null;
}

// The deny output when `denialFor` names a reason for the command or a `bash -c` or `eval` string in it.
export function guardDecision(hookInput, denialFor) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '' || !guardsOn()) return null;
  const reason = denialFor(command, hookInput) || innerDenial(command, hookInput, denialFor, 1);
  if (!reason) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

// In this order, so the first deny wins.
export const GUARDS = [['git-guard', gitDenial], ['secret-guard', secretDenial], ['destructive-guard', destructiveDenial]]
  .map(([name, denialFor]) => ({ name, run: (hookInput) => guardDecision(hookInput, denialFor) }));

// The one output, or null: the first deny, else the first other decision, plus every step's context.
export async function dispatchBash(hookInput, steps = GUARDS) {
  const outputs = [];
  for (const step of steps) {
    try {
      const output = await step.run(hookInput);
      if (output) outputs.push(output.hookSpecificOutput ?? {});
    } catch (error) {
      console.error(`${step.name}: ${error.message}`);
    }
  }
  const verdict = outputs.find((output) => output.permissionDecision === 'deny')
    ?? outputs.find((output) => output.permissionDecision !== undefined);
  const merged = { hookEventName: 'PreToolUse' };
  if (verdict) Object.assign(merged, { permissionDecision: verdict.permissionDecision, permissionDecisionReason: verdict.permissionDecisionReason });
  const contexts = outputs.map((output) => output.additionalContext).filter(Boolean);
  if (contexts.length > 0) merged.additionalContext = contexts.join('\n');
  return Object.keys(merged).length === 1 ? null : { hookSpecificOutput: merged };
}

if (isMain(import.meta.url)) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : await dispatchBash(JSON.parse(text));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // An unreadable input lets the call through.
  }
}
