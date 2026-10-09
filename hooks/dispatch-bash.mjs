#!/usr/bin/env node
// PreToolUse dispatcher on Bash: runs the three Bash guards inside one
// process, so a Bash call spawns one hook process. Each guard runs in its own
// try/catch, so a fault in one lets the rest run and the command go through as
// it did when each guard was its own hook. The first deny is returned.
// A fault reading or parsing the input exits 0 with no output.

import { wrapCommand } from '../lib/compress-output.mjs';
import { denialFor as destructiveDenial } from './guards/destructive-guard.mjs';
import { denialFor as gitDenial } from './guards/git-guard.mjs';
import { runDispatcherEntry, runSteps } from './dispatch-steps.mjs';
import { guardDecision } from './guards/guard-runner.mjs';
import { denialFor as secretDenial } from './guards/secret-guard.mjs';

// A step for a guard's `denialFor`.
function guardStep(denialFor) {
  return (hookInput) => guardDecision(hookInput, denialFor);
}

// Each `run` takes the hook input and returns a hook output object or null.
// The guards run in this order, so the first deny wins.
const GUARDS = [
  { name: 'git-guard', run: guardStep(gitDenial) },
  { name: 'secret-guard', run: guardStep(secretDenial) },
  { name: 'destructive-guard', run: guardStep(destructiveDenial) }
];

// The one output for `hookInput`, or null when no step has anything to say.
// A denied call is never wrapped; a fault in the wrapper lets the command run as written.
export async function dispatchBash(hookInput, guards = GUARDS, wrap = wrapCommand) {
  const guarded = await runSteps(hookInput, guards, []);
  if (guarded?.hookSpecificOutput.permissionDecision === 'deny') return guarded;
  let wrapped = null;
  try {
    wrapped = wrap(hookInput);
  } catch (error) {
    console.error(`compress-output: ${error.message}`);
  }
  if (wrapped === null) return guarded;
  return { hookSpecificOutput: { ...guarded?.hookSpecificOutput, ...wrapped.hookSpecificOutput } };
}

await runDispatcherEntry(import.meta.url, dispatchBash);
