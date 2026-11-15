import { readFileSync } from 'node:fs';
import process from 'node:process';
import { denyReason } from './guard-rules.mjs';
import { refuseFields } from './hook-refusal.mjs';
import { BUDGETS, EFFORTS, readKindTable, TABLE_PATH } from './model-kinds.mjs';
import { environmentMs } from './script-flags.mjs';
import { recordResearch, researchAgeMs } from './slice-state.mjs';
import { webSources, workerSize } from '#worker-size';

export function liftedEffort(effort, ceiling, level) {
  const lift = Math.min(EFFORTS.indexOf(ceiling), EFFORTS.indexOf(level));
  if (lift <= EFFORTS.indexOf(effort)) return effort;
  return EFFORTS[lift];
}

function isJobWord(word, job) {
  return [job, `${job}s`, `${job}es`, `${job}d`, `${job}ed`, `${job.replace(/e$/, '')}ing`].includes(word);
}

function jobKind(jobs, description = '') {
  const words = description.toLowerCase().match(/[a-z]+/g) ?? [];
  return Object.entries(jobs).find(([job]) => words.some((word) => isJobWord(word, job)))?.[1];
}

export const isUnnamedType = (table, type) => table.unnamed.types.includes(type ?? 'general-purpose');

function isUnnamed(table, input) {
  return isUnnamedType(table, input.subagent_type) && input.model === undefined && input.effort === undefined;
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

export function defaulted(input, budget) {
  const table = unnamedTable(input, budget);
  if (!table || labelOf(table, input)) return input;
  const label = `exo-kind: ${table.unnamed.kind}`;
  const prompt = input.prompt ?? '';
  return { ...input, prompt: LABEL_LINE.test(prompt) ? prompt.replace(LABEL_LINE, label) : `${label}\n${prompt}` };
}

export function resolvedKind(input, budget) {
  if (!BUDGETS.includes(budget)) return null;
  const retry = /^exo-retry$/m.test(input.prompt ?? '');
  const table = readKindTable(undefined, { budget, provider: sessionProvider(), retry });
  const agent = /^exo:(.+)$/.exec(input.subagent_type ?? '')?.[1];
  const unnamed = isUnnamed(table, input);
  const entry = table.agents[`agents/${agent}.md`];
  const name = labelOf(table, input, entry) ?? entry?.kind ?? (unnamed ? jobKind(table.unnamed.jobs, input.description) ?? table.unnamed.kind : undefined);
  return table.kinds[name] ? { table, agent, kind: table.kinds[name], label: labelOf(table, input, entry) } : null;
}

const isFetchSized = (table, type) => (table.fetchSized ?? []).includes(type);

function isMainResearch(hookInput) {
  const { tool_name: tool, tool_input: input, agent_id: agentId, session_id: sessionId } = hookInput;
  if (tool !== 'Agent' || !input || agentId || !sessionId || !webSources(input.prompt)) return false;
  const table = readKindTable();
  return isFetchSized(table, input.subagent_type) || isUnnamedType(table, input.subagent_type);
}

const PAGE_CUT = /\bhead\s+(?:-c|--bytes)|\bcut\s+-c/;

function cutsPage(hookInput) {
  const input = hookInput.tool_input;
  return hookInput.tool_name === 'Agent' && input?.subagent_type === 'exo:research-worker' && PAGE_CUT.test(input.prompt ?? '');
}

export function researchFields(hookInput) {
  if (cutsPage(hookInput)) return refuseFields('brief-cuts-page', denyReason('brief-cuts-page'), hookInput);
  if (!isMainResearch(hookInput)) return null;
  if (isUnnamedType(readKindTable(), hookInput.tool_input.subagent_type)) return refuseFields('research-unnamed', denyReason('research-unnamed'), hookInput);
  if (researchAgeMs(hookInput.session_id) >= environmentMs('EXO_RESEARCH_FANOUT_MS', 30_000)) return null;
  return refuseFields('research-fanout', denyReason('research-fanout'), hookInput);
}

export function recordResearchDispatch(hookInput) {
  if (isMainResearch(hookInput)) recordResearch(hookInput.session_id);
}

const INLINE_LINE = 'Run your single unit yourself and spawn no worker: this provider bills each spawn a cold prefix.';

export function inlineSingleWorker(input) {
  if (process.env.EXO_PROVIDER !== 'deepseek' || input.subagent_type !== 'exo:orchestrator') return input;
  const prompt = input.prompt ?? '';
  if (prompt.includes(INLINE_LINE) || workerSize({ prompt }).workers !== 1) return input;
  return { ...input, prompt: `${prompt.trimEnd()}\n${INLINE_LINE}` };
}
