import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { briefReads, workerSize } from '#worker-size';
import { hookAgentType, orchestratorPredispatchReads } from './context-limits.mjs';

const stateFile = (kind, agentId) => path.join(os.tmpdir(), `exo-${kind}-${String(agentId).replace(/[^\w-]/g, '_')}`);

function transcriptOf(input) {
  if (input.agent_transcript_path) return input.agent_transcript_path;
  if (typeof input.transcript_path !== 'string') return null;
  return path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'subagents', `agent-${input.agent_id}.jsonl`);
}

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

export function sliceWorkers(input) {
  return workerSize({ prompt: briefOf(input) }).workers;
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

const BASH_REASON = 'An orchestrator runs no Bash before its first dispatch. Send discovery and code reading to a lookup worker.';

function inside(file, root) {
  return file === root || file.startsWith(`${root}${path.sep}`);
}

function readReason(input) {
  const cwd = input.cwd ?? process.cwd();
  const file = path.resolve(cwd, String(input.tool_input?.file_path ?? ''));
  const reads = briefReads(briefOf(input));
  if (!reads.some((entry) => inside(file, path.resolve(cwd, entry)))) {
    const named = reads.length > 0 ? reads.join(', ') : 'none';
    return `Before its first dispatch an orchestrator reads only its brief's Reads: paths (${named}). Write the result file and dispatch now; give this file to a lookup or verification worker.`;
  }
  const limit = orchestratorPredispatchReads();
  if (predispatchReadCount(input.agent_id) < limit) return null;
  return `This orchestrator has made ${limit} Reads before its first dispatch. Write the result file and dispatch now; split the remaining reading and row checks across workers.`;
}

export function predispatchDecision(input = {}) {
  if (input.tool_name !== 'Bash' && input.tool_name !== 'Read') return null;
  if (!beforeFirstDispatch(input)) return null;
  const reason = input.tool_name === 'Bash' ? BASH_REASON : readReason(input);
  return reason ? { deny: reason } : null;
}

export function recordPredispatchRead(input = {}) {
  if (input.tool_name !== 'Read' || !beforeFirstDispatch(input)) return;
  fs.appendFileSync(stateFile('predispatch', input.agent_id), '.');
}
