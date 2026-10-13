#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { BUDGETS, INHERIT, readKindTable } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingValue } from '../lib/settings-store.mjs';

function raised(input, level) {
  if (input.subagent_type !== 'exo:find-open-points' || !['xhigh', 'max'].includes(level) || [level, 'max'].includes(input.effort)) return input;
  return { ...input, effort: level };
}

function filled(input, budget) {
  if (!BUDGETS.includes(budget)) return input;
  const table = readKindTable(undefined, { budget });
  const agent = /^exo:(.+)$/.exec(input.subagent_type ?? '')?.[1];
  const kind = table.kinds[/^exo-kind:\s*(\S+)/.exec(input.prompt ?? '')?.[1] ?? table.agents[`agents/${agent}.md`]?.kind];
  if (!kind) return input;
  const model = input.model ?? (kind.model === INHERIT ? undefined : kind.model);
  const effort = input.effort ?? kind.effort;
  return { ...input, ...(model && { model }), ...(effort && { effort }) };
}

export function agentEffort({ tool_name: tool, tool_input: input, effort } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input) return null;
  const updated = filled(raised(input, effort?.level), budget);
  if (!Object.keys(updated).some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

export function agentHook(hookInput, budget) {
  const output = agentEffort(hookInput, budget);
  const fields = contextFields(contextDecision(hookInput));
  if (!fields) return output;
  if (fields.permissionDecision) return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } };
  const base = output ?? { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  return { hookSpecificOutput: { ...base.hookSpecificOutput, ...fields } };
}

if (isMain(import.meta.url)) {
  try {
    const output = agentHook(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
