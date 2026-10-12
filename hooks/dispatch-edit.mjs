#!/usr/bin/env node
import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { commentDecision } from './comment-guard.mjs';

const STEPS = [
  { name: 'context-limit', run: (hookInput) => contextFields(contextDecision(hookInput)) },
  { name: 'comment-guard', run: commentDecision }
];

function runStep(step, hookInput) {
  try {
    return step.run(hookInput);
  } catch (error) {
    console.error(`${step.name}: ${error.message}`);
    return null;
  }
}

export function dispatchEdit(hookInput) {
  const contexts = [];
  for (const step of STEPS) {
    const fields = runStep(step, hookInput);
    if (fields?.permissionDecision === 'deny') return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } };
    if (fields?.additionalContext) contexts.push(fields.additionalContext);
  }
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: contexts.join('\n') } };
}

if (isMain(import.meta.url)) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : dispatchEdit(JSON.parse(text));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    process.exitCode = 0;
  }
}
