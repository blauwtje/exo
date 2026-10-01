#!/usr/bin/env node
// PreToolUse dispatcher on Read: runs the read guard and the delegate budget
// inside one process, so a Read call spawns one hook process where it spawned
// two. The guard runs first, then the budget unless the guard denied.
// A fault reading or parsing the input exits 0 with no output.

import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { delegateBudget } from './guards/delegate-budget.mjs';
import { guardRead } from './guards/read-guard.mjs';

const GUARDS = [{ name: 'read-guard', run: guardRead }];
const BOOKKEEPING = [{ name: 'delegate-budget', run: delegateBudget }];

// The one output for `hookInput`, or null when no step has anything to say.
export function dispatchRead(hookInput, guards = GUARDS, bookkeeping = BOOKKEEPING) {
  return runSteps(hookInput, guards, bookkeeping);
}

await runDispatcherEntry(import.meta.url, dispatchRead);
