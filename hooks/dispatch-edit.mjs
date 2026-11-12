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
  { name: 'context-limit', run: (hookInput) => contextFields(contextDecision(hookInput), hookInput) },
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
  let rewrite = null;
  for (const step of STEPS) {
    const fields = runStep(step, hookInput);
    if (fields?.permissionDecision === 'deny') return rememberRefusal(hookInput, withReceipt({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }, hookInput, fields, undefined, enabled), { guard: 'dispatch-edit' });
    if (fields?.updatedInput) rewrite = fields;
    if (fields?.additionalContext) contexts.push(fields.additionalContext);
  }
  if (contexts.length === 0 && !rewrite) return null;
  const context = contexts.length > 0 ? { additionalContext: contexts.join('\n') } : {};
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...rewrite, ...context } };
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
