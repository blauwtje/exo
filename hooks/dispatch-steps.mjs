// The step runner the PreToolUse dispatchers share: the guards first, then the
// bookkeeping steps unless a guard denied, each in its own try/catch, so a
// fault in one lets the rest run and the call go through as it did when each
// step was its own hook. The first deny is returned; the additional contexts
// of the steps that ran are joined into the same output, and the first
// `updatedInput` too, unless a step denied.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { isProcessEntry } from './guards/guard-runner.mjs';

// The one output for `hookInput`, or null when no step has anything to say.
// Each step's `run` takes the hook input and returns a hook output object or
// null; a denied call is never counted by a bookkeeping step.
export async function runSteps(hookInput, guards, bookkeeping) {
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
      // A step fault lets the call through, as its own hook's fault did.
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
  const rewritten = outputs.find((output) => output.updatedInput !== undefined);
  if (rewritten && !denied) merged.updatedInput = rewritten.updatedInput;
  if (Object.keys(merged).length === 1) return null;
  return { hookSpecificOutput: merged };
}

// The process entry of a dispatcher module: reads the hook JSON from stdin and
// writes the output of `dispatch`. An unreadable input lets the call through.
export async function runDispatcherEntry(moduleUrl, dispatch) {
  if (!isProcessEntry(moduleUrl)) return;
  try {
    const text = await readHookText();
    if (text.trim() !== '') {
      const output = await dispatch(JSON.parse(text));
      if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
    }
  } catch {
    // An unreadable input lets the call through.
  }
}
