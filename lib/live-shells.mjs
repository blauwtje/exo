import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLine } from './basics.mjs';
import { HANDOVER_TAIL } from './guard-rules.mjs';
import { refuseFields, ruleDeny } from './hook-refusal.mjs';
import { RESULT_FILE } from './result-file.mjs';
import { contextDefault } from './context-limits.mjs';

const STARTED = /^(?:Command running in background with ID: ([\w-]+)|Command [^\n]*moved to the background \(ID: ([\w-]+)\))/;
const MONITOR_STARTED = /Monitor started \(task ([\w-]+)/;
const NOTIFIED = /<task-id>([\w-]+)<\/task-id>(?:(?!<\/task-notification>)[\s\S])*?<status>(\w+)<\/status>/g;
const ENDED = new Set(['completed', 'failed', 'killed', 'stopped', 'cancelled']);
const MARKERS = ['"name":"Bash"', 'TaskStop', 'running in background', 'moved to the background', 'task-notification', 'Monitor'];

const stateFile = (agentId) => path.join(os.tmpdir(), `exo-shells-${String(agentId).replace(/[^\w-]/g, '_')}`);

export function transcriptOf(input) {
  if (!input.agent_id) return input.transcript_path;
  if (input.agent_transcript_path) return input.agent_transcript_path;
  if (typeof input.transcript_path !== 'string') return null;
  return path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'subagents', `agent-${input.agent_id}.jsonl`);
}

function blocksOf(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function textOf(block) {
  const content = block.type === 'tool_result' ? block.content : block.text;
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : '';
}

const BRIEF_RESULT = /\bResult:\s*`?([^\s`]+\.md)\b/;

function briefText(entry) {
  return blocksOf(entry).filter((block) => block.type === 'text').map(textOf).join('\n');
}

function briefResultPath(transcript) {
  try {
    for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
      const entry = parseLine(line);
      if (entry?.type !== 'user') continue;
      return BRIEF_RESULT.exec(briefText(entry))?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function startsTask(block) {
  if (block.type !== 'tool_use') return false;
  return block.name === 'Monitor' || block.name === 'Bash';
}

function startedId(text) {
  const shell = STARTED.exec(text);
  return shell?.[1] ?? shell?.[2] ?? MONITOR_STARTED.exec(text)?.[1];
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

function warnedBefore(agentId, kind) {
  const file = `${stateFile(agentId)}-${kind}`;
  try {
    if (fs.existsSync(file)) return true;
    fs.writeFileSync(file, '.');
  } catch {
    return true;
  }
  return false;
}

const REDIRECT_TARGET = /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"'|;&<>]+)/g;

function writtenFiles(input) {
  if (input.tool_name === 'Write') return [input.tool_input?.file_path];
  const command = input.tool_input?.command;
  if (input.tool_name !== 'Bash' || typeof command !== 'string') return [];
  return [...command.matchAll(REDIRECT_TARGET)].map((match) => match[1]);
}

const sameFile = (file, named) => path.resolve(file) === path.resolve(named) || file.endsWith(`/${named}`) || named.endsWith(`/${file}`);

export const handoverStep = (input) => {
  const named = briefResultPath(transcriptOf(input));
  return named ? `write ${named} as a handover, ${HANDOVER_TAIL}, and reply with its path` : `reply with a handover, ${HANDOVER_TAIL}`;
};

export function shellStopDecision(hookInput) {
  const input = hookInput ?? {};
  if (!input.agent_id) return null;
  const named = briefResultPath(transcriptOf(input));
  const isResult = (file) => typeof file === 'string' && (named ? sameFile(file, named) : RESULT_FILE.test(file));
  const writesResult = writtenFiles(input).some(isResult);
  if (!writesResult) return null;
  const live = liveShells(transcriptOf(input));
  if (live.length === 0 || warnedBefore(input.agent_id, 'write')) return null;
  return ruleDeny('live-shells', live.join(', '));
}

export function shellStopFields(hookInput) {
  const decision = shellStopDecision(hookInput);
  return decision ? refuseFields(decision.rule, decision.deny, hookInput) : null;
}

const LEAD_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const LEAD_WRITE_NUDGE = 'You have written several files inline. Hand the remaining writes to exo:build with a brief.';

const writesFile = (sessionId) => path.join(os.tmpdir(), `exo-writes-${String(sessionId).replace(/[^\w-]/g, '_')}`);
const isExoPath = (file) => file.split(path.sep).includes('.exo') || file.split('/').includes('.exo');

function readPaths(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function leadWriteFields(hookInput) {
  const target = hookInput.tool_input?.file_path;
  if (hookInput.agent_id || !LEAD_WRITE_TOOLS.has(hookInput.tool_name) || !target || isExoPath(target)) return null;
  const file = writesFile(hookInput.session_id);
  const seen = readPaths(file);
  if (seen.includes(target)) return null;
  fs.appendFileSync(file, `${target}\n`);
  const limit = contextDefault('leadWriteNudge', os.homedir());
  return seen.length + 1 === limit ? { additionalContext: LEAD_WRITE_NUDGE } : null;
}
