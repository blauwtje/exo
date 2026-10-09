#!/usr/bin/env node
// PreToolUse dispatcher on Bash: runs the four Bash guards and the
// memory-booking approval inside one process, so a Bash call spawns one
// hook process where it spawned six. The guards run first, then the
// bookkeeping steps unless a guard denied, each in its own try/catch, so a
// fault in one lets the rest run and the command go through as it did when each
// step was its own hook. The first deny is returned; the additional contexts of
// the steps that ran are joined into the same output.
// A fault reading or parsing the input exits 0 with no output.

import { approve } from '../skills/remember/scripts/approve-book.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as detachDenial } from './guards/detach-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { guardDecision } from './guards/guard-runner.mjs';
import { denialFor as secretDenial } from './guards/secret-guard.mjs';

// A step for a guard's `denialFor`.
function guardStep(denialFor) {
  return (hookInput) => guardDecision(hookInput, denialFor);
}

// Each `run` takes the hook input and returns a hook output object or null.
// The guards run first, in this order, so the first deny wins; the approval
// runs after them, and only when no guard denied.
const GUARDS = [
  { name: 'git-guard', run: guardStep(gitDenial) },
  { name: 'secret-guard', run: guardStep(secretDenial) },
  { name: 'destructive-guard', run: guardStep(destructiveDenial) },
  { name: 'detach-guard', run: guardStep(detachDenial) }
];
const BOOKKEEPING = [{ name: 'approve-book', run: approve }];

// The one output for `hookInput`, or null when no step has anything to say.
export function dispatchBash(hookInput, guards = GUARDS, bookkeeping = BOOKKEEPING) {
  return runSteps(hookInput, guards, bookkeeping);
}

await runDispatcherEntry(import.meta.url, dispatchBash);
