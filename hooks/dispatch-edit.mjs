#!/usr/bin/env node
// PreToolUse dispatcher on Edit, WebFetch and WebSearch: runs the repeat guard
// and the delegate budget inside one process, so one of these calls spawns one
// hook process where it spawned two. Both are bookkeeping, so a denial by the
// repeat guard is returned and the budget does not count that call.
// A fault reading or parsing the input exits 0 with no output.

import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { delegateBudget } from './guards/delegate-budget.mjs';
import { guardCall } from './guards/repeat-guard.mjs';

const BOOKKEEPING = [
  { name: 'repeat-guard', run: guardCall },
  { name: 'delegate-budget', run: delegateBudget }
];

// The one output for `hookInput`, or null when no step has anything to say.
export function dispatchEdit(hookInput, guards = [], bookkeeping = BOOKKEEPING) {
  return runSteps(hookInput, guards, bookkeeping);
}

await runDispatcherEntry(import.meta.url, dispatchEdit);
