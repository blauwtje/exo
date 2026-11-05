#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { contextDecision, contextFields, hookAgentType, orchestratorWorkers } from '../lib/context-limits.mjs';
import { BUDGETS, EFFORTS, INHERIT, readKindTable, TABLE_PATH } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { settingValue } from '../lib/settings-store.mjs';
import { recordSlice, sliceCount, sliceWorkers } from '../lib/slice-state.mjs';
import { withNormalReads, workerSize } from '#worker-size';
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
  return table.kinds[name] ? { table, agent, kind: table.kinds[name] } : null;
}

function filled(input, budget) {
  const kind = resolvedKind(input, budget)?.kind;
  if (!kind) return input;
  const { model: passedModel, ...rest } = input;
  const model = passedModel ?? (kind.model === INHERIT ? undefined : kind.model);
  const effort = input.effort ?? kind.effort;
  return { ...rest, ...(model && { model }), ...(effort && { effort }) };
}

export function agentEffort({ tool_name: tool, tool_input: input, effort, cwd } = {}, budget = settingValue('budget')) {
  if (tool !== 'Agent' || !input) return null;
  const updated = raised(filled(defaulted(withNormalReads(input, cwd), budget), budget), effort?.level);
  if (![...Object.keys(updated), ...Object.keys(input)].some((key) => updated[key] !== input[key])) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } };
}

function pairText(model, effort) {
  return `${model ?? 'the session model'}, ${effort ?? 'the session effort'}`;
}

function kindLabels(kinds, passed) {
  const entries = Object.entries(kinds);
  const names = (list) => list.map(([name]) => name).join(', ');
  const exact = entries.filter(([, kind]) => Object.entries(passed).every(([key, value]) => kind[key] === value));
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
  const { kind, table, agent } = resolved;
  const expected = { model: kind.model === INHERIT ? undefined : kind.model, effort: kind.effort ?? undefined };
  const differs = (key) => input[key] !== undefined && input[key] !== expected[key] && (key === 'model' || expected.effort !== undefined);
  if (!['model', 'effort'].some(differs)) return null;
  const passed = Object.fromEntries(['model', 'effort'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  const reason = `exo:${agent} runs on ${pairText(expected.model, expected.effort)} by the kind table; the call passed ${pairText(passed.model, passed.effort)}. ${kindLabels(table.kinds, passed)} Start the brief with the label to run that pair. No user request for that model → drop \`model\` and \`effort\`.`;
  return { permissionDecision: 'deny', permissionDecisionReason: reason };
}

function sizeReason(size, { missing, fetchDocs }) {
  if (size.invalid.length) return `This worker brief has an invalid ${size.invalid.join(' and ')} line. Give a whole number.`;
  if (size.unresolved.length) return `This worker brief reads paths that do not exist: ${size.unresolved.join(', ')}. Expected: \`Reads: a.md, lib/b.mjs\` or \`Reads: none\`.`;
  if (missing.join() === 'Reads') return 'This worker brief lacks a `Reads:` line. Add one of paths or `none`.';
  if (missing.length) return `This worker brief lacks ${missing.join(' and ')}. Add a \`Reads:\` line of paths or \`none\` and a \`Result:\` line naming one \`.exo/<...>.md\` file.`;
  const estimate = `This worker brief reads about ${size.tokens} tokens against a budget of ${size.budget}.`;
  if (fetchDocs) return `${estimate} Lower the \`Fetches:\` count or split the fetches across more agents.`;
  return `${estimate} Largest reads: ${size.largest.map((entry) => `${entry.path} (${entry.tokens})`).join(', ')}. Split the work into more agents by path or line range, each with its own \`Reads:\` and \`Result:\`.`;
}

function workersFields(prompt) {
  const { workers } = workerSize({ prompt });
  const limit = orchestratorWorkers();
  if (workers !== undefined && workers <= limit) return null;
  const reason = `This orchestrator dispatch needs a \`Workers: <n>\` line with n from 1 to ${limit}. Split the job into slices of its own phases, each at most ${limit} workers, retries included.`;
  return { permissionDecision: 'deny', permissionDecisionReason: reason };
}

function workerSizeFields(hookInput = {}) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input) return null;
  if (input.subagent_type === 'exo:orchestrator' && hookAgentType(hookInput) !== 'orchestrator') return workersFields(input.prompt);
  const fromOrchestrator = hookAgentType(hookInput) === 'orchestrator';
  const fetchDocs = input.subagent_type === 'exo:fetch-docs';
  if (fetchDocs ? !fromOrchestrator : !readKindTable().unnamed.types.includes(input.subagent_type ?? 'general-purpose')) return null;
  const size = workerSize({ prompt: input.prompt, cwd });
  const missing = fromOrchestrator ? (fetchDocs ? [] : size.missing) : (size.sized ? [] : ['Reads']);
  const refused = size.invalid.length > 0 || size.unresolved.length > 0 || missing.length > 0 || ((fromOrchestrator || size.sized) && size.tokens > size.budget);
  if (!refused) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: sizeReason(size, { missing, fetchDocs }) };
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
  const output = agentEffort(hookInput, budget);
  const fields = mismatchFields(hookInput, budget) ?? unknownKindFields(hookInput, budget) ?? workerSizeFields(hookInput) ?? sliceFields(hookInput) ?? contextFields(contextDecision(hookInput));
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
