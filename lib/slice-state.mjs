import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { baseOf, briefReads, workersOf } from '#worker-size';
import { orchestratorPredispatchReads, orchestratorWorkers } from './context-limits.mjs';
import { denyReason } from './guard-rules.mjs';
import { hookAgentType, transcriptOf } from './context-decisions.mjs';

const HANDOVER_TEMPLATE = fileURLToPath(new URL('../lib/assets/handover-template.md', import.meta.url));

const SKILL_BASE = /^Base directory for this skill: (.+)$/m;
const NAMED_FILE = /`([^`\s]+\.md)`/g;

function skillReferences(brief) {
  const base = SKILL_BASE.exec(brief)?.[1]?.trim();
  if (!base) return [];
  return [...new Set([...brief.matchAll(NAMED_FILE)].map(([, name]) => path.resolve(base, name)))];
}

function skillRunFolder(brief, cwd) {
  const base = SKILL_BASE.exec(brief)?.[1]?.trim();
  return base ? [path.join(cwd, '.exo', path.basename(base))] : [];
}

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

export function researchAgeMs(sessionId) {
  try {
    return Date.now() - fs.statSync(stateFile('research', sessionId)).mtimeMs;
  } catch {
    return Infinity;
  }
}

export function recordResearch(sessionId) {
  fs.writeFileSync(stateFile('research', sessionId), '.');
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

function allowedReads(input, cwd) {
  const brief = briefOf(input);
  const base = baseOf(brief, cwd);
  return [...briefReads(brief, cwd, input).map((entry) => path.resolve(base, entry)), ...skillReferences(brief), ...skillRunFolder(brief, cwd), HANDOVER_TEMPLATE];
}

function readReason(input) {
  const cwd = input.cwd ?? process.cwd();
  const file = path.resolve(cwd, String(input.tool_input?.file_path ?? ''));
  if (!allowedReads(input, cwd).some((entry) => inside(file, entry))) {
    const named = briefReads(briefOf(input), cwd, input);
    return denyReason('orchestrator-reads', '', { named: named.length > 0 ? named.join(', ') : 'none' });
  }
  return budgetReason(input);
}

function budgetReason(input) {
  const base = orchestratorPredispatchReads();
  const count = predispatchReadCount(input.agent_id);
  if (count < base) return null;
  const limit = base + allowedReads(input, input.cwd ?? process.cwd()).length;
  if (count < limit) return null;
  return denyReason('orchestrator-budget', '', { limit });
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
