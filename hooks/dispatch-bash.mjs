#!/usr/bin/env node
// PreToolUse dispatcher on Bash: runs the repeat guard, the delegate budget,
// the memory-booking approval and the six Bash guards
// inside one process, so a Bash call spawns one hook process where it spawned
// nine. The guards run first, then the bookkeeping steps unless a guard denied,
// each in its own try/catch, so a fault in one lets the rest run and the
// command go through as it did when each step was its own hook. The first deny is returned; the additional
// contexts of the steps that ran are joined into the same output.
// A fault reading or parsing the input exits 0 with no output.

import { approve } from '../skills/remember/scripts/nudge.mjs';
import { delegateBudget } from './guards/delegate-budget.mjs';
import { denialFor as outputDenial } from './guards/bash-output-guard.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as detachDenial } from './guards/detach-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { guardDecision } from './guards/guard-runner.mjs';
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
export function dispatchBash(hookInput, guards = GUARDS, bookkeeping = BOOKKEEPING) {
  return runSteps(hookInput, guards, bookkeeping);
}

await runDispatcherEntry(import.meta.url, dispatchBash);
