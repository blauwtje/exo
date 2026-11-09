#!/usr/bin/env node
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { editRuleFields } from '../lib/edit-code-rules.mjs';
import { impactFields } from '../lib/edit-impact.mjs';
import { contextDecision, contextFields } from '../lib/context-decisions.mjs';
import { shellStopFields } from '../lib/live-shells.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, writeHookOutput } from '../lib/hook-refusal.mjs';
import { withReceipt } from './context-limit.mjs';

const STEPS = [
  { name: 'context-limit', run: (hookInput) => contextFields(contextDecision(hookInput)) },
  { name: 'shell-stop', run: shellStopFields },
  { name: 'code-rules', run: editRuleFields },
  { name: 'edit-impact', run: impactFields }
];

function runStep(step, hookInput) {
  try {
    return step.run(hookInput);
  } catch (error) {
    console.error(`${step.name}: ${error.message}`);
    return null;
  }
}

export function dispatchEdit(hookInput, enabled) {
  const contexts = [];
  for (const step of STEPS) {
    const fields = runStep(step, hookInput);
    if (fields?.permissionDecision === 'deny') return rememberRefusal(hookInput, withReceipt({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }, hookInput, fields, undefined, enabled), { guard: 'dispatch-edit' });
    if (fields?.additionalContext) contexts.push(fields.additionalContext);
  }
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: contexts.join('\n') } };
}

if (isMain(import.meta.url) && !inSidecall()) {
  try {
    const text = await readHookText();
    const input = text.trim() === '' ? null : JSON.parse(text);
    writeHookOutput(input, input && dispatchEdit(input), 'dispatch-edit');
  } catch {
    process.exitCode = 0;
  }
}
