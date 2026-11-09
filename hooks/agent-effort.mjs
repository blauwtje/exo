#!/usr/bin/env node

import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { briefedInput, isolationFields, resultToolsFields, sizeReason } from '../lib/brief-denials.mjs';
import { orchestratorWorkers } from '../lib/context-limits.mjs';
import { contextDecision, contextFields, hookAgentType } from '../lib/context-decisions.mjs';
import { denyReason } from '../lib/guard-rules.mjs';
import { INHERIT, readKindTable } from '../lib/model-kinds.mjs';
import { kindLabels, pairText, runsPassed } from '../lib/kind-labels.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingOrDefault } from '../lib/settings-store.mjs';
import { recordSlice, sliceCount, sliceWorkers } from '../lib/slice-state.mjs';
import { baseOf, budgetedReads, locatedReads, webSources, workerSize } from '#worker-size';
import { withReceipt } from './context-limit.mjs';
import { defaulted, liftedEffort, resolvedKind, unknownKind } from '../lib/kind-resolution.mjs';
import { inlineSingleWorker } from '../lib/inline-single-worker.mjs';
import { dispatchRules } from './dispatch-rules.mjs';

function budgetSetting() {
  return settingOrDefault('budget').value;
}

function unknownKindFields({ tool_name: tool, tool_input: input } = {}, budget = budgetSetting()) {
  if (tool !== 'Agent' || !input || !unknownKind(input, budget)) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('unknown-kind') };
}

function filled(input, budget, level) {
  const kind = resolvedKind(input, budget)?.kind;
  if (!kind) return input;
  const { model: passedModel, ...rest } = input;
  const model = passedModel ?? (kind.model === INHERIT ? undefined : kind.model);
  const effort = liftedEffort(input.effort ?? kind.effort, kind.ceiling, level);
  return { ...rest, ...(model && { model }), ...(effort && { effort }) };
}

function workerScope(hookInput) {
  const { tool_input: input } = hookInput;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return null;
  const fromOrchestrator = hookAgentType(hookInput) === 'orchestrator';
  const table = readKindTable();
  const fetchDocs = (table.fetchSized ?? []).includes(input.subagent_type) && webSources(input.prompt);
  const sized = fetchDocs || table.unnamed.types.includes(input.subagent_type ?? 'general-purpose');
  return sized ? { fromOrchestrator, fetchDocs } : null;
}

function readsRewrite(hookInput = {}) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return { input, ambiguous: [], scope: null };
  const { prompt: located, ambiguous } = locatedReads(input.prompt, cwd, hookInput);
  const scope = workerScope(hookInput);
  const prompt = scope && !scope.fetchDocs ? budgetedReads(located, cwd, hookInput) : located;
  return { input: prompt === input.prompt ? input : { ...input, prompt }, ambiguous, scope };
}

export function agentEffort(hookInput = {}, budget = budgetSetting(), rewrite = readsRewrite(hookInput)) {
  const { tool_name: tool, tool_input: input, effort, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  const updated = inlineSingleWorker(briefedInput(filled(defaulted(rewrite.input, budget), budget, effort?.level), cwd));
  if (![...Object.keys(updated), ...Object.keys(input)].some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

function mismatchFields({ tool_name: tool, tool_input: input } = {}, budget = budgetSetting()) {
  if (tool !== 'Agent' || !input) return null;
  const resolved = resolvedKind(input, budget);
  if (!resolved?.agent) return null;
  const { kind, table, agent, label } = resolved;
  const expected = { model: kind.model === INHERIT ? undefined : kind.model, effort: kind.effort ?? undefined };
  const differs = (key) => input[key] !== undefined && input[key] !== expected[key] && (key === 'model' || expected.effort !== undefined);
  if (!['model', 'effort'].some(differs)) return null;
  const passed = Object.fromEntries(['model', 'effort'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  const source = label ? `because \`exo-kind: ${label}\` in the brief moved it` : 'by the kind table';
  const rule = Object.values(table.kinds).some((entry) => runsPassed(entry, passed)) ? 'kind-mismatch-label' : 'kind-mismatch';
  const detail = `exo:${agent} runs on ${pairText(expected.model, expected.effort)} ${source}; the call passed ${pairText(passed.model, passed.effort)}. ${kindLabels(table.kinds, passed)}`;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason(rule, detail) };
}

function workersFields(prompt) {
  const { workers } = workerSize({ prompt });
  const limit = orchestratorWorkers();
  if (workers !== undefined && workers <= limit) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('workers-line', `n from 1 to ${limit}`) };
}

function missingFields(size, { fromOrchestrator, fetchDocs }) {
  if (fetchDocs) return [];
  if (fromOrchestrator) return size.missing;
  return size.sized ? [] : ['Reads'];
}

function workerSizeFields(hookInput = {}, rewrite = readsRewrite(hookInput)) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return workersFields(input.prompt);
  if (!rewrite.scope) return null;
  const { fromOrchestrator, fetchDocs } = rewrite.scope;
  const size = workerSize({ prompt: rewrite.input.prompt, cwd, session: hookInput, requireFetches: fetchDocs });
  const missing = missingFields(size, rewrite.scope);
  const refused = size.invalid.length > 0 || size.unresolved.length > 0 || missing.length > 0 || ((fromOrchestrator || size.sized) && size.tokens > size.budget);
  if (!refused) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: sizeReason(size, { missing, fetchDocs, ambiguous: rewrite.ambiguous, prompt: rewrite.input.prompt, base: baseOf(rewrite.input.prompt, cwd) }) };
}

function isSliceCall(hookInput) {
  return hookInput.tool_name === 'Agent' && Boolean(hookInput.agent_id) && hookAgentType(hookInput) === 'orchestrator';
}

function sliceFields(hookInput) {
  if (!isSliceCall(hookInput)) return null;
  const workers = sliceWorkers(hookInput);
  if (workers === undefined || sliceCount(hookInput.agent_id) < workers) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('slice-spent', `sized at ${workers} workers, it has made ${workers} dispatches, retries included`) };
}

function recordDispatch(hookInput) {
  if (isSliceCall(hookInput)) recordSlice(hookInput.agent_id);
}

export function agentHook(hookInput, budget, enabled) {
  const rewrite = readsRewrite(hookInput);
  const output = agentEffort(hookInput, budget, rewrite);
  const fields = mismatchFields(hookInput, budget) ?? unknownKindFields(hookInput, budget) ?? isolationFields(hookInput) ?? resultToolsFields(hookInput) ?? workerSizeFields(hookInput, rewrite) ?? sliceFields(hookInput) ?? contextFields(contextDecision(hookInput));
  const ran = output?.hookSpecificOutput.updatedInput ?? hookInput.tool_input;
  const receipt = (message, receiptFields) => withReceipt(message, hookInput, receiptFields, ran, enabled);
  if (fields?.permissionDecision) return receipt({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }, fields);
  recordDispatch(hookInput);
  const context = [dispatchRules(hookInput), fields?.additionalContext].filter(Boolean).join('\n\n');
  if (!context) return receipt(output, null);
  const base = output ?? { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  return receipt({ hookSpecificOutput: { ...base.hookSpecificOutput, additionalContext: context } }, null);
}

if (isMain(import.meta.url) && !inSidecall()) {
  try {
    const output = agentHook(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
