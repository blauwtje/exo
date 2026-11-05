#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { sizeReason } from '../lib/brief-denials.mjs';
import { contextDecision, contextFields, hookAgentType, orchestratorWorkers } from '../lib/context-limits.mjs';
import { BUDGETS, EFFORTS, INHERIT, readKindTable, TABLE_PATH } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingValue } from '../lib/settings-store.mjs';
import { recordSlice, sliceCount, sliceWorkers } from '../lib/slice-state.mjs';
import { budgetedReads, locatedReads, workerSize } from '#worker-size';
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

function movesAgent(entry, input, label) {
  return !entry || entry.labels?.includes(label) || input.model !== undefined || input.effort !== undefined;
}

const LABEL_LINE = /^exo-kind:\s*\S+/;

function labelOf(table, input, entry) {
  const label = /^exo-kind:\s*(\S+)/.exec(input.prompt ?? '')?.[1];
  return table.kinds[label] && movesAgent(entry, input, label) ? label : undefined;
}

function unnamedTable(input, budget) {
  if (!BUDGETS.includes(budget)) return null;
  const table = readKindTable(undefined, { budget, provider: sessionProvider() });
  return isUnnamed(table, input) && !jobKind(table.unnamed.jobs, input.description) ? table : null;
}

function unknownKind(input, budget) {
  const table = unnamedTable(input, budget);
  return Boolean(table) && LABEL_LINE.test(input.prompt ?? '') && !labelOf(table, input);
}

function defaulted(input, budget) {
  if (!unnamedTable(input, budget) || LABEL_LINE.test(input.prompt ?? '')) return input;
  return { ...input, prompt: `exo-kind: build\n${input.prompt ?? ''}` };
}

const UNKNOWN_KIND_REASON = 'This delegate names an unknown kind. Start its brief with `exo-kind: <kind>`: `hardest` for an open choice or unknown cause, `build` for a fully decided fix, `review` for a review.';

function unknownKindFields({ tool_name: tool, tool_input: input } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input || !unknownKind(input, budget)) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: UNKNOWN_KIND_REASON };
}

function resolvedKind(input, budget) {
  if (!BUDGETS.includes(budget)) return null;
  const retry = /^exo-retry$/m.test(input.prompt ?? '');
  const table = readKindTable(undefined, { budget, provider: sessionProvider(), retry });
  const agent = /^exo:(.+)$/.exec(input.subagent_type ?? '')?.[1];
  const unnamed = isUnnamed(table, input);
  const entry = table.agents[`agents/${agent}.md`];
  const name = labelOf(table, input, entry) ?? entry?.kind ?? (unnamed ? jobKind(table.unnamed.jobs, input.description) ?? table.unnamed.kind : undefined);
  return table.kinds[name] ? { table, agent, kind: table.kinds[name], label: labelOf(table, input, entry) } : null;
}

function filled(input, budget) {
  const kind = resolvedKind(input, budget)?.kind;
  if (!kind) return input;
  const { model: passedModel, ...rest } = input;
  const model = passedModel ?? (kind.model === INHERIT ? undefined : kind.model);
  const effort = input.effort ?? kind.effort;
  return { ...rest, ...(model && { model }), ...(effort && { effort }) };
}

function workerScope(hookInput) {
  const { tool_input: input } = hookInput;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return null;
  const fromOrchestrator = hookAgentType(hookInput) === 'orchestrator';
  const fetchDocs = input.subagent_type === 'exo:fetch-docs';
  const sized = fetchDocs ? fromOrchestrator : readKindTable().unnamed.types.includes(input.subagent_type ?? 'general-purpose');
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

export function agentEffort(hookInput = {}, budget = settingValue('budget'), rewrite = readsRewrite(hookInput)) {
  const { tool_name: tool, tool_input: input, effort } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  const updated = raised(filled(defaulted(rewrite.input, budget), budget), effort?.level);
  if (![...Object.keys(updated), ...Object.keys(input)].some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

function pairText(model, effort) {
  return `${model ?? 'the session model'}, ${effort ?? 'the session effort'}`;
}

function runsPassed(kind, passed) {
  return Object.entries(passed).every(([key, value]) => kind[key] === value);
}

function kindLabels(kinds, passed) {
  const entries = Object.entries(kinds);
  const names = (list) => list.map(([name]) => name).join(', ');
  const exact = entries.filter(([, kind]) => runsPassed(kind, passed));
  if (exact.length) return `\`exo-kind:\` labels for ${pairText(passed.model, passed.effort)}: ${names(exact)}.`;
  const gap = ([, kind]) => Math.abs(EFFORTS.indexOf(kind.effort) - EFFORTS.indexOf(passed.effort));
  const sameModel = entries.filter(([, kind]) => kind.model === passed.model);
  const nearest = sameModel.filter((entry) => gap(entry) === Math.min(...sameModel.map(gap)));
  if (!nearest.length) return `No kind runs ${pairText(passed.model, passed.effort)}, and none runs ${passed.model ?? 'that model'}.`;
  return `No kind runs ${pairText(passed.model, passed.effort)}; closest on ${passed.model}: ${names(nearest)}.`;
}

function mismatchFields({ tool_name: tool, tool_input: input } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input) return null;
  const resolved = resolvedKind(input, budget);
  if (!resolved?.agent) return null;
  const { kind, table, agent, label } = resolved;
  const expected = { model: kind.model === INHERIT ? undefined : kind.model, effort: kind.effort ?? undefined };
  const differs = (key) => input[key] !== undefined && input[key] !== expected[key] && (key === 'model' || expected.effort !== undefined);
  if (!['model', 'effort'].some(differs)) return null;
  const passed = Object.fromEntries(['model', 'effort'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  const source = label ? `because \`exo-kind: ${label}\` in the brief moved it` : 'by the kind table';
  const ending = Object.values(table.kinds).some((entry) => runsPassed(entry, passed)) ? 'Start the brief with the label to run that pair, or drop `model` and `effort`.' : 'Drop `model` and `effort`.';
  const reason = `exo:${agent} runs on ${pairText(expected.model, expected.effort)} ${source}; the call passed ${pairText(passed.model, passed.effort)}. ${kindLabels(table.kinds, passed)} ${ending}`;
  return { permissionDecision: 'deny', permissionDecisionReason: reason };
}

function workersFields(prompt) {
  const { workers } = workerSize({ prompt });
  const limit = orchestratorWorkers();
  if (workers !== undefined && workers <= limit) return null;
  const reason = `This orchestrator dispatch needs a \`Workers: <n>\` line with n from 1 to ${limit}. Split the job into slices of its own phases, each at most ${limit} workers, retries included.`;
  return { permissionDecision: 'deny', permissionDecisionReason: reason };
}

function workerSizeFields(hookInput = {}, rewrite = readsRewrite(hookInput)) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return workersFields(input.prompt);
  if (!rewrite.scope) return null;
  const { fromOrchestrator, fetchDocs } = rewrite.scope;
  const size = workerSize({ prompt: rewrite.input.prompt, cwd, session: hookInput });
  const missing = fromOrchestrator ? (fetchDocs ? [] : size.missing) : (size.sized ? [] : ['Reads']);
  const refused = size.invalid.length > 0 || size.unresolved.length > 0 || missing.length > 0 || ((fromOrchestrator || size.sized) && size.tokens > size.budget);
  if (!refused) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: sizeReason(size, { missing, fetchDocs, ambiguous: rewrite.ambiguous, prompt: rewrite.input.prompt }) };
}

function isSliceCall(hookInput) {
  return hookInput.tool_name === 'Agent' && Boolean(hookInput.agent_id) && hookAgentType(hookInput) === 'orchestrator';
}

function sliceFields(hookInput) {
  if (!isSliceCall(hookInput)) return null;
  const workers = sliceWorkers(hookInput);
  if (workers === undefined || sliceCount(hookInput.agent_id) < workers) return null;
  const reason = `This orchestrator slice was sized at ${workers} workers and has made ${workers} dispatches, retries included. Write the result file your brief names and return; the lead plans the next slice.`;
  return { permissionDecision: 'deny', permissionDecisionReason: reason };
}

function recordDispatch(hookInput) {
  if (isSliceCall(hookInput)) recordSlice(hookInput.agent_id);
}

export function agentHook(hookInput, budget, enabled) {
  const rewrite = readsRewrite(hookInput);
  const output = agentEffort(hookInput, budget, rewrite);
  const fields = mismatchFields(hookInput, budget) ?? unknownKindFields(hookInput, budget) ?? workerSizeFields(hookInput, rewrite) ?? sliceFields(hookInput) ?? contextFields(contextDecision(hookInput));
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
