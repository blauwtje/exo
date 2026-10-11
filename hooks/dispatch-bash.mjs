#!/usr/bin/env node
// The one PreToolUse hook on Bash: runs the three guards in one process, each
// in its own try/catch, then the context check, and returns the first deny. `guards` `off` stands them
// down; an unreadable setting leaves them on. An unreadable input exits 0 with
// no output.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { innerCommands } from './guards/inner-commands.mjs';
import { approvedPass, parkOutput, runGateReason } from './guards/run-gate.mjs';
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
// In a run a git-guard or destructive-guard deny parks the run; secret-guard's stays plain.
export const GUARDS = [['git-guard', gitDenial, true], ['secret-guard', secretDenial, false], ['destructive-guard', destructiveDenial, true]]
  .map(([name, denialFor, parks]) => ({
    name,
    guard: true,
    run: (hookInput) => {
      const output = guardDecision(hookInput, denialFor);
      return parks ? parkOutput(hookInput, output) : output;
    }
  }));

// First, in a run only: an approved gate's command passes once and the guards stand down;
// a publish, release, tag push or deploy parks.
export const RUN_GATE_STEP = {
  name: 'run-gate',
  run(hookInput) {
    const output = approvedPass(hookInput) ?? parkOutput(hookInput, guardDecision(hookInput, runGateReason));
    return output && { ...output, skipGuards: true };
  }
};

// Last, so a guard's deny wins; a context deny still beats any allow.
export const CONTEXT_STEP = {
  name: 'context-limit',
  run(hookInput) {
    const fields = contextFields(contextDecision(hookInput));
    return fields && { hookSpecificOutput: fields };
  }
};

// The one output, or null: the first deny, else the first other decision, plus every step's context.
export async function dispatchBash(hookInput, steps = [RUN_GATE_STEP, ...GUARDS, CONTEXT_STEP]) {
  const outputs = [];
  let skipGuards = false;
  for (const step of steps) {
    if (skipGuards && step.guard) continue;
    try {
      const output = await step.run(hookInput);
      if (output) outputs.push(output.hookSpecificOutput ?? {});
      if (output?.skipGuards) skipGuards = true;
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
