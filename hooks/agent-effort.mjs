#!/usr/bin/env node

import { inSidecall } from '#hook-input';
import { briefedInput, mergedFields, refusalRound, resultToolsFields, sizeDenial, workersFields } from '../lib/brief-denials.mjs';
import { contextDecision, contextFields, roleFields, hookAgentType } from '../lib/context-decisions.mjs';
import { INHERIT, readKindTable } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { refuseFields, rememberRefusal, runHook } from '../lib/hook-refusal.mjs';
import { settingOrDefault } from '../lib/settings-store.mjs';
import { baseOf, budgetedReads, locatedReads, webSources, workerSize } from '#worker-size';
import { withReceipt } from './context-limit.mjs';
import { defaulted, inlineSingleWorker, liftedEffort, researchFields, resolvedKind } from '../lib/kind-resolution.mjs';

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
  const fromOrchestrator = hookAgentType(hookInput) === 'orchestrator';
  if (input.subagent_type === 'exo:orchestrator' && !fromOrchestrator) return null;
  const table = readKindTable();
  const fetchDocs = (table.fetchSized ?? []).includes(input.subagent_type) && webSources(input.prompt);
  const sized = fetchDocs || table.unnamed.types.includes(input.subagent_type ?? 'general-purpose');
  return sized ? { fromOrchestrator, fetchDocs } : null;
}

function readsRewrite(hookInput) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return { input, ambiguous: [], scope: null };
  const { prompt: located, ambiguous } = locatedReads(input.prompt, cwd, hookInput);
  const scope = workerScope(hookInput);
  const prompt = scope && !scope.fetchDocs ? budgetedReads(located, cwd, hookInput) : located;
  return { input: prompt === input.prompt ? input : { ...input, prompt }, ambiguous, scope };
}

export function agentEffort(hookInput, budget, rewrite = readsRewrite(hookInput)) {
  const { tool_name: tool, tool_input: input, effort, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  const updated = inlineSingleWorker(briefedInput(filled(defaulted(rewrite.input, budget), budget, effort?.level), cwd));
  if (![...Object.keys(updated), ...Object.keys(input)].some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

function missingFields(size, { fromOrchestrator, fetchDocs }) {
  if (fetchDocs) return size.missing.filter((field) => field === 'Fetches');
  return fromOrchestrator ? size.missing : [];
}

function workerSizeFields(hookInput, rewrite) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return workersFields(input.prompt, hookInput);
  if (!rewrite.scope) return null;
  const { fromOrchestrator, fetchDocs } = rewrite.scope;
  const size = workerSize({ prompt: rewrite.input.prompt, cwd, session: hookInput, requireFetches: fetchDocs });
  const missing = missingFields(size, rewrite.scope);
  const over = (fromOrchestrator || size.sized) && size.tokens > size.budget;
  if (!(size.invalid.length || size.unresolved.length || missing.length || over)) return null;
  const reason = sizeDenial(size, { missing, fetchDocs, ambiguous: rewrite.ambiguous, prompt: rewrite.input.prompt, base: baseOf(rewrite.input.prompt, cwd) });
  return refuseFields(over ? 'brief-over-budget' : 'brief-lacks-fields', reason, hookInput);
}

function agentFields(hookInput, budget, rewrite) {
  return refusalRound(hookInput, mergedFields([
    roleFields(hookInput),
    researchFields(hookInput),
    resultToolsFields(hookInput),
    workerSizeFields(hookInput, rewrite),
    contextFields(contextDecision(hookInput), hookInput)
  ]));
}

export function agentHook(hookInput, budget = settingOrDefault('budget').value, enabled) {
  const rewrite = readsRewrite(hookInput);
  const output = agentEffort(hookInput, budget, rewrite);
  const fields = agentFields(hookInput, budget, rewrite);
  const ran = { ...hookInput, tool_input: output?.hookSpecificOutput.updatedInput ?? hookInput.tool_input };
  const receipt = (message, noted) => withReceipt(message, { hookInput: ran, fields: noted, enabled });
  if (fields?.permissionDecision) {
    const sent = receipt({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }, fields);
    return fields.permissionDecisionReason.includes('LOOP ') ? sent : rememberRefusal(hookInput, sent, { guard: 'agent-effort' });
  }
  if (!fields?.additionalContext) return receipt(output, null);
  const base = output ?? { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  return receipt({ hookSpecificOutput: { ...base.hookSpecificOutput, additionalContext: fields.additionalContext } }, null);
}

if (isMain(import.meta.url) && !inSidecall()) await runHook('agent-effort', agentHook);
