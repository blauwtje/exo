import fs from 'node:fs';
import path from 'node:path';
import { parseLine } from './basics.mjs';
import { HANDOVER_TAIL } from './guard-rules.mjs';

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

function firstUserEntry(text) {
  for (const line of text.split('\n')) {
    const entry = parseLine(line);
    if (entry?.type === 'user') return entry;
  }
  return null;
}

function readTranscript(transcript) {
  try {
    return fs.readFileSync(transcript, 'utf8');
  } catch {
    return null;
  }
}

function briefResultPath(transcript) {
  const text = readTranscript(transcript);
  if (text === null) return null;
  const entry = firstUserEntry(text);
  if (!entry) return null;
  return BRIEF_RESULT.exec(briefText(entry))?.[1] ?? null;
}

export const handoverStep = (input) => {
  const named = briefResultPath(transcriptOf(input));
  return named ? `write ${named} as a handover, ${HANDOVER_TAIL}, and reply with its path` : `reply with a handover, ${HANDOVER_TAIL}`;
};
