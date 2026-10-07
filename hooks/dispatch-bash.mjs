#!/usr/bin/env node
// PreToolUse dispatcher on Bash: runs the five Bash guards, the delegate budget
// and the memory-booking approval inside one process, so a Bash call spawns one
// hook process where it spawned seven. The guards run first, then the
// bookkeeping steps unless a guard denied, each in its own try/catch, so a
// fault in one lets the rest run and the command go through as it did when each
// step was its own hook. The first deny is returned; the additional contexts of
// the steps that ran are joined into the same output.
// A fault reading or parsing the input exits 0 with no output.

import { currentHost } from '#host';
import { approve } from '../skills/remember/scripts/approve-book.mjs';
import { delegateBudget } from './guards/delegate-budget.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as detachDenial } from './guards/detach-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { guardDecision } from './guards/guard-runner.mjs';
import { denialFor as secretDenial } from './guards/secret-guard.mjs';
import { denialFor as writingDenial } from './guards/writing-guard.mjs';

// A step for a guard's `denialFor`.
function guardStep(denialFor) {
  return (hookInput) => guardDecision(hookInput, denialFor);
}

// Each `run` takes the hook input and returns a hook output object or null.
// The guards run first, in this order, so the first deny wins; the delegate
// budget and the approval run after them, and only when no guard denied, so a
// denied call is never counted.
const GUARDS = [
  { name: 'git-guard', run: guardStep(gitDenial) },
  { name: 'secret-guard', run: guardStep(secretDenial) },
  { name: 'destructive-guard', run: guardStep(destructiveDenial) },
  { name: 'detach-guard', run: guardStep(detachDenial) },
  { name: 'writing-guard', run: guardStep(writingDenial) }
];
const BOOKKEEPING = [
  { name: 'delegate-budget', run: delegateBudget },
  { name: 'approve-book', run: approve }
];

// The delegate budget counts from a Claude transcript, so Codex skips it.
function bookkeepingFor(host) {
  if (host === 'codex') return BOOKKEEPING.filter((step) => step.name !== 'delegate-budget');
  return BOOKKEEPING;
}

// The one output for `hookInput`, or null when no step has anything to say.
export function dispatchBash(hookInput, guards = GUARDS, bookkeeping = bookkeepingFor(currentHost())) {
  return runSteps(hookInput, guards, bookkeeping);
}

await runDispatcherEntry(import.meta.url, dispatchBash);
