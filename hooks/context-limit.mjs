#!/usr/bin/env node

import { inSidecall } from '#hook-input';
import { contextDecision, contextFields, readCapDecision } from '../lib/context-decisions.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, runHook } from '../lib/hook-refusal.mjs';
import { settingOrDefault } from '../lib/settings-store.mjs';

const REASON_MAX = 140;

function receiptsOn() {
  try {
    return settingOrDefault('receipts').value !== 'off';
  } catch {
    return true;
  }
}

function shortReason(reason) {
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim();
  return text.length > REASON_MAX ? `${text.slice(0, REASON_MAX - 1)}…` : text;
}

function receiptLine({ tool_name: tool, tool_input: input }, fields) {
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

export function withReceipt(output, { hookInput, fields, enabled = receiptsOn }) {
  const line = receiptLine(hookInput, fields);
  if (!line || !enabled()) return output;
  return { ...output, systemMessage: line };
}

export function contextHook(input, enabled) {
  const decision = readCapDecision(input) ?? contextDecision(input);
  const fields = contextFields(decision, input);
  const output = fields ? { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } } : null;
  return rememberRefusal(input, withReceipt(output, { hookInput: input, fields, enabled }), { guard: 'context-limit' });
}

if (isMain(import.meta.url) && !inSidecall()) await runHook('context-limit', contextHook);
