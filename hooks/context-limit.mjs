#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields, persistedReadDecision } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingValue } from '../lib/settings-store.mjs';

const REASON_MAX = 140;

export function receiptsOn(read = () => settingValue('receipts')) {
  try {
    const value = read();
    return value !== 'off' && value !== false;
  } catch {
    return true;
  }
}

function shortReason(reason) {
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim();
  return text.length > REASON_MAX ? `${text.slice(0, REASON_MAX - 1)}…` : text;
}

export function receiptLine({ tool_name: tool, tool_input: original } = {}, fields, input = original) {
  if (fields?.permissionDecision === 'deny') return `exo blocked: ${shortReason(fields.permissionDecisionReason)}`;
  if (tool === 'Skill') {
    const name = /^exo:(.+)$/.exec(input?.skill ?? '')?.[1];
    return name ? `exo › ${name}` : null;
  }
  if (tool === 'Agent') {
    const name = /^exo:(.+)$/.exec(input?.subagent_type ?? '')?.[1];
    if (!name) return null;
    const detail = [input.model, input.effort].filter((part) => typeof part === 'string' && part !== '').join(', ');
    return detail ? `exo › ${name} (${detail})` : `exo › ${name}`;
  }
  return null;
}

export function withReceipt(output, hookInput, fields, input, enabled = receiptsOn) {
  const line = receiptLine(hookInput, fields, input);
  if (!line || !enabled()) return output;
  return { ...output, systemMessage: line };
}

export function contextHook(input, enabled) {
  const fields = contextFields(persistedReadDecision(input) ?? contextDecision(input));
  const output = fields ? { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } } : null;
  return withReceipt(output, input, fields, undefined, enabled);
}

if (isMain(import.meta.url)) {
  try {
    const output = contextHook(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
