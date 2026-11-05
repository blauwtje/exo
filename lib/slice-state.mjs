import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workerSize } from '#worker-size';

const sliceFile = (agentId) => path.join(os.tmpdir(), `exo-slice-${String(agentId).replace(/[^\w-]/g, '_')}`);

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

export function sliceWorkers(input) {
  return workerSize({ prompt: briefText(firstLine(transcriptOf(input))) }).workers;
}

export function sliceCount(agentId) {
  try {
    return fs.statSync(sliceFile(agentId)).size;
  } catch {
    return 0;
  }
}

export function recordSlice(agentId) {
  fs.appendFileSync(sliceFile(agentId), '.');
}
