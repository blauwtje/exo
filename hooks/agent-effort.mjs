#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { BUDGETS, INHERIT, readKindTable, TABLE_PATH } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingValue } from '../lib/settings-store.mjs';
import { withReceipt } from './context-limit.mjs';
import { dispatchRules } from './dispatch-rules.mjs';

function raised(input, level) {
  if (input.subagent_type !== 'exo:find-open-points' || !['xhigh', 'max'].includes(level) || [level, 'max'].includes(input.effort)) return input;
  return { ...input, effort: level };
}

function isJobWord(word, job) {
  return [job, `${job}s`, `${job}es`, `${job}d`, `${job}ed`, `${job.replace(/e$/, '')}ing`].includes(word);
}

function jobKind(jobs, description = '') {
  const words = description.toLowerCase().match(/[a-z]+/g) ?? [];
  return Object.entries(jobs).find(([job]) => words.some((word) => isJobWord(word, job)))?.[1];
}

function isUnnamed(table, input) {
  return table.unnamed.types.includes(input.subagent_type ?? 'general-purpose') && input.model === undefined && input.effort === undefined;
}

function sessionProvider() {
  const name = process.env.EXO_PROVIDER;
  if (!name) return 'claude';
  const { providers } = JSON.parse(readFileSync(TABLE_PATH, 'utf8'));
  return Object.hasOwn(providers, name) ? name : 'claude';
}

function labelOf(table, input) {
  const label = /^exo-kind:\s*(\S+)/.exec(input.prompt ?? '')?.[1];
  return table.kinds[label] ? label : undefined;
}

function unlabelled(input, budget) {
  if (!BUDGETS.includes(budget)) return false;
  const table = readKindTable(undefined, { budget, provider: sessionProvider() });
  return isUnnamed(table, input) && !labelOf(table, input) && !jobKind(table.unnamed.jobs, input.description);
}

const UNLABELLED_REASON = 'This delegate names no job. Start its brief with `exo-kind: <kind>`: `hardest` for an open choice or unknown cause, `build` for a fully decided fix, `review` for a review.';

function unlabelledFields({ tool_name: tool, tool_input: input } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input || !unlabelled(input, budget)) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: UNLABELLED_REASON };
}

function filled(input, budget) {
  if (!BUDGETS.includes(budget)) return input;
  const retry = /^exo-retry$/m.test(input.prompt ?? '');
  const table = readKindTable(undefined, { budget, provider: sessionProvider(), retry });
  const agent = /^exo:(.+)$/.exec(input.subagent_type ?? '')?.[1];
  const unnamed = isUnnamed(table, input);
  const kind = table.kinds[labelOf(table, input) ?? table.agents[`agents/${agent}.md`]?.kind ?? (unnamed ? jobKind(table.unnamed.jobs, input.description) ?? table.unnamed.kind : undefined)];
  if (!kind) return input;
  const tableModel = kind.model === INHERIT ? undefined : kind.model;
  const { model: passedModel, ...rest } = input;
  const model = agent ? tableModel : passedModel ?? tableModel;
  const tableEffort = kind.effort ?? input.effort;
  const effort = agent ? tableEffort : input.effort ?? kind.effort;
  return { ...rest, ...(model && { model }), ...(effort && { effort }) };
}

export function agentEffort({ tool_name: tool, tool_input: input, effort } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input) return null;
  const updated = raised(filled(input, budget), effort?.level);
  if (![...Object.keys(updated), ...Object.keys(input)].some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

function replacedNote(passed = {}, ran = {}) {
  const parts = ['model', 'effort'].filter((key) => passed[key] !== undefined && passed[key] !== ran[key]).map((key) => passed[key]);
  return parts.length ? `replaced ${parts.join(', ')}` : '';
}

function withReplacedNote(output, hookInput, ran) {
  const note = /^exo:/.test(ran?.subagent_type ?? '') ? replacedNote(hookInput.tool_input, ran) : '';
  if (!note || !output?.systemMessage) return output;
  const line = output.systemMessage;
  return { ...output, systemMessage: line.endsWith(')') ? `${line.slice(0, -1)}; ${note})` : `${line} (${note})` };
}

export function agentHook(hookInput, budget, enabled) {
  const output = agentEffort(hookInput, budget);
  const fields = unlabelledFields(hookInput, budget) ?? contextFields(contextDecision(hookInput));
  const ran = output?.hookSpecificOutput.updatedInput ?? hookInput.tool_input;
  const receipt = (message, receiptFields) => withReplacedNote(withReceipt(message, hookInput, receiptFields, ran, enabled), hookInput, ran);
  if (fields?.permissionDecision) return receipt({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }, fields);
  const context = [dispatchRules(hookInput), fields?.additionalContext].filter(Boolean).join('\n\n');
  if (!context) return receipt(output, null);
  const base = output ?? { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  return receipt({ hookSpecificOutput: { ...base.hookSpecificOutput, additionalContext: context } }, null);
}

if (isMain(import.meta.url)) {
  try {
    const output = agentHook(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
