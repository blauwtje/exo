#!/usr/bin/env node
// PreToolUse dispatcher on Bash: runs the repeat guard, the delegate budget
// with the context watch, the memory-booking approval and the six Bash guards
// inside one process, so a Bash call spawns one hook process where it spawned
// nine. The guards run first, then the bookkeeping steps unless a guard denied,
// each awaited in its own try/catch, because the delegate budget is async, so a
// fault in one lets the rest run and the command go through as it did when
// each step was its own hook. The first deny is returned; the additional
// contexts of the steps that ran are joined into the same output.
// A fault reading or parsing the input exits 0 with no output.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { approve } from '../skills/remember/scripts/nudge.mjs';
import { delegateBudget } from './guards/delegate-budget.mjs';
import { denialFor as outputDenial } from './guards/bash-output-guard.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as detachDenial } from './guards/detach-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { guardDecision, isProcessEntry } from './guards/guard-runner.mjs';
import { guardCall } from './guards/repeat-guard.mjs';
import { denialFor as secretDenial } from './guards/secret-guard.mjs';
import { denialFor as writingDenial } from './guards/writing-guard.mjs';

// A step for a guard's `denialFor`.
function guardStep(denialFor) {
  return (hookInput) => guardDecision(hookInput, denialFor);
}

// Each `run` takes the hook input and returns a hook output object or null.
// The guards run first, in this order, so the first deny wins; the repeat
// guard, the delegate budget and the approval run after them, and only when
// no guard denied, so a denied call is never counted.
const GUARDS = [
  { name: 'git-guard', run: guardStep(gitDenial) },
  { name: 'secret-guard', run: guardStep(secretDenial) },
  { name: 'destructive-guard', run: guardStep(destructiveDenial) },
  { name: 'detach-guard', run: guardStep(detachDenial) },
  { name: 'bash-output-guard', run: guardStep(outputDenial) },
  { name: 'writing-guard', run: guardStep(writingDenial) }
];
const BOOKKEEPING = [
  { name: 'repeat-guard', run: guardCall },
  { name: 'delegate-budget', run: delegateBudget },
  { name: 'nudge-approve', run: approve }
];

// The one output for `hookInput`, or null when no step has anything to say.
export async function dispatchBash(hookInput, guards = GUARDS, bookkeeping = BOOKKEEPING) {
  const outputs = [];
  let denied = false;
  for (const step of [...guards, ...bookkeeping]) {
    if (denied && bookkeeping.includes(step)) continue;
    try {
      const output = await step.run(hookInput);
      if (!output) continue;
      outputs.push(output.hookSpecificOutput ?? {});
      if (output.hookSpecificOutput?.permissionDecision === 'deny') denied = true;
    } catch (error) {
      // A step fault lets the command through, as its own hook's fault did.
      console.error(`${step.name}: ${error.message}`);
    }
  }
  if (outputs.length === 0) return null;
  const verdict = outputs.find((output) => output.permissionDecision === 'deny')
    ?? outputs.find((output) => output.permissionDecision !== undefined)
    ?? {};
  const contexts = outputs.map((output) => output.additionalContext).filter(Boolean);
  const merged = { hookEventName: 'PreToolUse' };
  if (verdict.permissionDecision !== undefined) {
    merged.permissionDecision = verdict.permissionDecision;
    merged.permissionDecisionReason = verdict.permissionDecisionReason;
  }
  if (contexts.length > 0) merged.additionalContext = contexts.join('\n');
  if (Object.keys(merged).length === 1) return null;
  return { hookSpecificOutput: merged };
}

if (isProcessEntry(import.meta.url)) {
  try {
    const text = await readHookText();
    if (text.trim() !== '') {
      const output = await dispatchBash(JSON.parse(text));
      if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
    }
  } catch {
    // An unreadable input lets the command through.
  }
}
