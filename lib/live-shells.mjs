import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcriptOf } from './context-decisions.mjs';
import { RESULT_FILE } from './worker-size.mjs';

const STARTED = /running in background with ID: ([\w-]+)/;
const MONITOR_STARTED = /Monitor started \(task ([\w-]+)/;
const NOTIFIED = /<task-id>([\w-]+)<\/task-id>(?:(?!<\/task-notification>)[\s\S])*?<status>(\w+)<\/status>/g;
const ENDED = new Set(['completed', 'failed', 'killed', 'stopped', 'cancelled']);
const MARKERS = ['run_in_background', 'TaskStop', 'running in background', 'task-notification', 'Monitor'];

const stateFile = (agentId) => path.join(os.tmpdir(), `exo-shells-${String(agentId).replace(/[^\w-]/g, '_')}`);

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function blocksOf(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function startsTask(block) {
  if (block.type !== 'tool_use') return false;
  return block.name === 'Monitor' || (block.name === 'Bash' && block.input?.run_in_background === true);
}

function startedId(text) {
  return STARTED.exec(text)?.[1] ?? MONITOR_STARTED.exec(text)?.[1];
}

function textOf(block) {
  const content = block.type === 'tool_result' ? block.content : block.text;
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : '';
}

export function liveShells(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  const starts = new Set();
  const live = new Set();
  for (const line of text.split('\n')) {
    if (!MARKERS.some((marker) => line.includes(marker))) continue;
    for (const block of blocksOf(parseLine(line))) {
      if (startsTask(block)) starts.add(block.id);
      if (block.type === 'tool_use' && block.name === 'TaskStop') live.delete(block.input?.task_id);
      if (block.type === 'tool_result' && starts.has(block.tool_use_id)) {
        const id = startedId(textOf(block));
        if (id) live.add(id);
      }
      if (block.type === 'tool_use') continue;
      for (const [, id, status] of textOf(block).matchAll(NOTIFIED)) if (ENDED.has(status)) live.delete(id);
    }
  }
  return [...live];
}

function warnedBefore(agentId) {
  try {
    if (fs.existsSync(stateFile(agentId))) return true;
    fs.writeFileSync(stateFile(agentId), '.');
  } catch {
    return true;
  }
  return false;
}

export function shellStopDecision(hookInput) {
  const input = hookInput ?? {};
  const file = input.tool_input?.file_path;
  if (!input.agent_id || input.tool_name !== 'Write' || typeof file !== 'string' || !RESULT_FILE.test(file)) return null;
  const live = liveShells(transcriptOf(input));
  if (live.length === 0 || warnedBefore(input.agent_id)) return null;
  return { deny: `Background shells you started still run: ${live.join(', ')}. Stop each with TaskStop, then Write this file again, so nothing runs on after you return.` };
}

export function shellStopFields(hookInput) {
  const decision = shellStopDecision(hookInput);
  return decision ? { permissionDecision: 'deny', permissionDecisionReason: decision.deny } : null;
}
