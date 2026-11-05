import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { briefReads, workersOf } from '#worker-size';
import { hookAgentType, orchestratorPredispatchReads, orchestratorWorkers, transcriptOf } from './context-limits.mjs';

const HANDOVER_TEMPLATE = fileURLToPath(new URL('../skills/route-skills/assets/handover-template.md', import.meta.url));

const stateFile = (kind, agentId) => path.join(os.tmpdir(), `exo-${kind}-${String(agentId).replace(/[^\w-]/g, '_')}`);

function firstLine(file) {
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').split('\n', 1)[0];
  } catch {
    return '';
  }
}

function briefText(line) {
  try {
    const content = JSON.parse(line).message?.content ?? '';
    if (typeof content === 'string') return content;
    return content.map((part) => part.text ?? '').join('\n');
  } catch {
    return '';
  }
}

const briefOf = (input) => briefText(firstLine(transcriptOf(input)));

function countOf(kind, agentId) {
  try {
    return fs.statSync(stateFile(kind, agentId)).size;
  } catch {
    return 0;
  }
}

function linesOf(file) {
  if (!file) return [];
  try {
    return fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return [];
  }
}

function leadMessage(line) {
  if (!line.includes('"kind":"coordinator"')) return '';
  try {
    const entry = JSON.parse(line);
    if ((entry.origin ?? entry.attachment?.origin)?.kind !== 'coordinator') return '';
    return entry.attachment?.prompt ?? briefText(line);
  } catch {
    return '';
  }
}

export function sliceWorkers(input) {
  const [brief = '', ...later] = linesOf(transcriptOf(input));
  const limit = orchestratorWorkers();
  const declared = later.map((line) => workersOf(leadMessage(line))).filter((workers) => workers <= limit);
  return declared.at(-1) ?? workersOf(briefText(brief));
}

export function sliceCount(agentId) {
  return countOf('slice', agentId);
}

export function recordSlice(agentId) {
  fs.appendFileSync(stateFile('slice', agentId), '.');
}

export function predispatchReadCount(agentId) {
  return countOf('predispatch', agentId);
}

function beforeFirstDispatch(input) {
  return Boolean(input.agent_id) && hookAgentType(input) === 'orchestrator' && sliceCount(input.agent_id) === 0;
}

function inside(file, root) {
  return file === root || file.startsWith(`${root}${path.sep}`);
}

const allowedReads = (input, cwd) => [...briefReads(briefOf(input), cwd), HANDOVER_TEMPLATE];

function readReason(input) {
  const cwd = input.cwd ?? process.cwd();
  const file = path.resolve(cwd, String(input.tool_input?.file_path ?? ''));
  if (!allowedReads(input, cwd).some((entry) => inside(file, path.resolve(cwd, entry)))) {
    const named = briefReads(briefOf(input), cwd);
    return `Before its first dispatch an orchestrator reads only its brief's Reads: paths (${named.length > 0 ? named.join(', ') : 'none'}) and the handover template. Write the result file and dispatch now; give this file to a lookup or verification worker.`;
  }
  return budgetReason(input);
}

function budgetReason(input) {
  const base = orchestratorPredispatchReads();
  const count = predispatchReadCount(input.agent_id);
  if (count < base) return null;
  const limit = base + allowedReads(input, input.cwd ?? process.cwd()).length;
  if (count < limit) return null;
  return `This orchestrator has made ${limit} Reads or Bash calls before its first dispatch. Write the result file and dispatch now; split the remaining reading and row checks across workers.`;
}

export function predispatchDecision(input = {}) {
  if (input.tool_name !== 'Bash' && input.tool_name !== 'Read') return null;
  if (!beforeFirstDispatch(input)) return null;
  const reason = input.tool_name === 'Bash' ? budgetReason(input) : readReason(input);
  return reason ? { deny: reason } : null;
}

export function recordPredispatchRead(input = {}) {
  if (!['Read', 'Bash'].includes(input.tool_name) || !beforeFirstDispatch(input)) return;
  fs.appendFileSync(stateFile('predispatch', input.agent_id), '.');
}

export function predispatchBashDecision(hookInput) {
  const input = { ...hookInput, tool_name: 'Bash' };
  const decision = predispatchDecision(input);
  if (!decision) recordPredispatchRead(input);
  return decision;
}
