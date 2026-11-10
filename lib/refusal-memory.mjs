import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { denyReason } from './guard-rules.mjs';

const stateFile = (sessionId) => path.join(os.tmpdir(), `exo-refusals-${String(sessionId).replace(/[^\w-]/g, '_')}.json`);

function normalizeCall({ tool_name: tool, tool_input: input } = {}) {
  const text = JSON.stringify(input ?? {}).replace(/\s+/g, ' ').toLowerCase();
  return `${tool}:${text}`;
}

function readHits(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function countHit({ session_id: sessionId, tool_name: tool, tool_input: input }, guard, guardText = '') {
  const file = stateFile(sessionId);
  const hits = readHits(file);
  const key = `${guard}|${normalizeCall({ tool_name: tool, tool_input: input })}`;
  hits[key] = (hits[key] ?? 0) + 1;
  if (hits[key] === 1) hits[`first|${key}`] = guardText;
  fs.writeFileSync(file, JSON.stringify(hits));
  return { hit: hits[key], first: hits[`first|${key}`] };
}

export function refusalText(hookInput, { guard, guardText }) {
  if (!hookInput?.session_id) return guardText;
  const { hit, first } = countHit(hookInput, guard, guardText);
  if (hit === 1) return guardText;
  if (hit === 2) return denyReason('repeat-refusal', '', { first: (first ?? guardText).replace(/\.$/, '') });
  return denyReason('repeat-stop');
}
