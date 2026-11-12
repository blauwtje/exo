import fs, { existsSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { agentCanWrite, agentTools } from './agent-tools.mjs';
import { allowedPart, briefedPrompt, denyReason, rulePart } from './guard-rules.mjs';
import { refuseFields } from './hook-refusal.mjs';
import { orchestratorWorkers } from './context-limits.mjs';
import { decide, formatLine, recordRound } from './loop-budget.mjs';
import { RESULT_FILE, RESULT_NAME_HINT } from './result-file.mjs';
import { briefResultKind, workerSize } from './worker-size.mjs';

const SHOWN_CANDIDATES = 5;
const READS_LABELS = /^[ \t]*(?:[-*][ \t]+)?\**(?:(?:Read first|Reads first|Read|Input|Inputs|File|Files|Sources?|Paths?)\**(?:[ \t]*\([^)\n]*\))?:|[^:\n]{1,40}:[ \t]*read\b).*$/im;
const ABSOLUTE_PATH = /(?<![\w.~])\/[^\s`'"(),;:]+/g;

const NAMED_WORD = /[./]/;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;

function isFile(target) {
  return statSync(target, { throwIfNoEntry: false })?.isFile() ?? false;
}

function isDirectory(target) {
  return statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function worktreeHint(missing, prompt = '') {
  const named = [...prompt.matchAll(ABSOLUTE_PATH)].map(([word]) => word.replace(/\.+$/, ''));
  const holder = named.find((dir) => isDirectory(dir) && missing.some((name) => existsSync(path.resolve(dir, name))));
  return holder ? allowedPart('brief-worktree', { dir: holder }) : '';
}

function unresolvedReason(unresolved, ambiguous, searched = [], prompt) {
  const several = ambiguous.map(({ name, matches }) => `${name} matches ${matches.slice(0, SHOWN_CANDIDATES).join(', ')}`);
  const missing = unresolved.filter((name) => !ambiguous.some((entry) => entry.name === name));
  const parts = [
    several.length && rulePart('brief-ambiguous-name', { matches: several.join('; ') }),
    missing.length && rulePart('brief-missing-path', { names: missing.join(', '), searched: searched.join(', ') || 'the working directory' }),
  ].filter(Boolean);
  return denyReason('brief-unresolved', undefined, { found: parts.join('. It also reads '), worktree: worktreeHint(missing, prompt) });
}

function namedFiles(prompt, base) {
  const words = prompt.split(/[\s`'"(),;]+/).map((word) => word.replace(/[.:]+$/, '').replace(LINE_SUFFIX, ''));
  const files = words.filter((word) => NAMED_WORD.test(word) && !RESULT_FILE.test(word) && isFile(path.resolve(base, word)));
  return [...new Set(files)];
}

function fittingFiles(files, base) {
  const fitting = [];
  for (const file of files) {
    const next = [...fitting, file];
    const { tokens, budget } = workerSize({ prompt: `Reads: ${next.join(', ')}`, cwd: base });
    if (tokens <= budget) fitting.push(file);
  }
  return fitting.slice(0, SHOWN_CANDIDATES);
}

function readsLine(prompt, base) {
  if (!base) return allowedPart('brief-reads-none');
  const fitting = fittingFiles(namedFiles(prompt, base), base);
  return fitting.length ? allowedPart('brief-reads-named', { files: fitting.join(', ') }) : allowedPart('brief-reads-any');
}

function fittingRange(top, size, base) {
  if (!top || !base) return '';
  const target = path.resolve(base, top.path);
  if (!isFile(target) || top.tokens <= size.budget) return '';
  const lines = fs.readFileSync(target, 'utf8').split('\n').length;
  const room = Math.max(size.budget - (size.tokens - top.tokens), 0);
  const last = Math.floor((lines * room) / top.tokens);
  if (last < 1) return '';
  return allowedPart('brief-range', { path: top.path, last, room });
}

function readsLabelHint(prompt = '') {
  const found = READS_LABELS.exec(prompt)?.[0].trim();
  return found ? rulePart('brief-reads-label', { found: found.slice(0, 80) }) : '';
}

export function workersFields(prompt, hookInput) {
  const { workers } = workerSize({ prompt });
  const limit = orchestratorWorkers();
  if (workers !== undefined && workers >= 1 && workers <= limit) return null;
  return refuseFields('workers-line', denyReason('workers-line', `n from 1 to ${limit}`), hookInput);
}

export function isolationFields(hookInput = {}) {
  if (hookInput.tool_name !== 'Agent' || hookInput.tool_input?.isolation !== 'worktree') return null;
  return refuseFields('agent-isolation', denyReason('agent-isolation'), hookInput);
}

function resultToolsReason(type) {
  return denyReason('result-tools', `${type} has no Write tool`);
}

export function resultToolsFields(hookInput = {}) {
  const { tool_name: tool, tool_input: input, cwd } = hookInput;
  if (tool !== 'Agent' || !input?.prompt) return null;
  const type = input.subagent_type ?? 'general-purpose';
  if (agentCanWrite(type, cwd) || briefResultKind(input.prompt) !== 'file') return null;
  return refuseFields('result-tools', resultToolsReason(type), hookInput);
}

export function sizeReason(size, { missing, fetchDocs, ambiguous, prompt, base }) {
  if (size.invalid.length) return denyReason('brief-invalid', undefined, { labels: size.invalid.join(' and ') });
  if (missing.includes('Fetches')) return denyReason('brief-lacks-fetches');
  if (size.unresolved.length) return unresolvedReason(size.unresolved, ambiguous, size.searched, prompt);
  const hint = [missing.includes('Reads') && readsLabelHint(prompt), missing.includes('Result') && RESULT_NAME_HINT].filter(Boolean).join(' ');
  if (missing.join() === 'Reads') return denyReason('brief-lacks-reads', hint, { reads: readsLine(prompt, base) });
  const reads = missing.includes('Reads') ? `${readsLine(prompt, base)} and ` : '';
  if (missing.length) return denyReason('brief-lacks-fields', hint, { missing: missing.join(' and '), reads });
  const params = { tokens: size.tokens, budget: size.budget };
  if (fetchDocs) return denyReason('brief-over-fetches', undefined, params);
  const largest = size.largest.map((entry) => `${entry.path} (${entry.tokens})`).join(', ');
  const detail = `largest reads ${largest}; cut at least ${size.tokens - size.budget} tokens`;
  return denyReason('brief-over-budget', detail, { ...params, range: fittingRange(size.largest[0], size, base) });
}

export function briefedInput(input, cwd) {
  const prompt = briefedPrompt(input.prompt ?? '', agentTools(input.subagent_type, cwd));
  return prompt === (input.prompt ?? '') ? input : { ...input, prompt };
}

export function mergedFields(results) {
  const present = results.filter(Boolean);
  const denials = present.filter((fields) => fields.permissionDecision === 'deny');
  if (denials.length === 1) return denials[0];
  if (denials.length > 1) return { ...denials[0], permissionDecisionReason: denials.map((fields) => fields.permissionDecisionReason).join('\n\n') };
  const notes = present.filter((fields) => fields.additionalContext);
  if (notes.length < 2) return present[0] ?? null;
  return { ...notes[0], additionalContext: notes.map((fields) => fields.additionalContext).join('\n\n') };
}

function dispatchIdentity(input = {}) {
  const task = input.description ?? String(input.prompt ?? '').split('\n').find((line) => line.trim() && !/^exo-kind:/.test(line)) ?? '';
  return crypto.createHash('sha256').update(JSON.stringify([input.subagent_type ?? '', task.trim()])).digest('hex').slice(0, 16);
}

function dispatchDir({ session_id: session, tool_input: input }) {
  return path.join(os.tmpdir(), `exo-refusal-${String(session).replace(/[^\w-]/g, '_')}`, dispatchIdentity(input));
}

function capped(hookInput, fields, decision) {
  const note = refuseFields('refusal-cap', `${denyReason('refusal-cap')}\n\n${formatLine('refusal', decision)}`, hookInput)?.additionalContext;
  return note ? mergedFields([{ ...fields, permissionDecisionReason: note }, fields]) : fields;
}

export function refusalRound(hookInput, fields) {
  if (fields?.permissionDecision !== 'deny' || !hookInput.session_id) return fields;
  const dir = dispatchDir(hookInput);
  const decision = decide(dir, 'refusal');
  if (decision.verdict === 'STOP') return capped(hookInput, fields, decision);
  recordRound(dir, { kind: 'refusal', openAfter: 1 });
  if (process.env.EXO_RUN_DIR) recordRound(process.env.EXO_RUN_DIR, { kind: 'refusal', openAfter: 1 });
  return fields;
}
