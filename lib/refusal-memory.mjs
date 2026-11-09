import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REMINDER_TEXT = 'exo: this call was refused once already; use the route that refusal named';
const REMINDER_MAX = 160;
const STOP_TEXT = 'exo: this call was refused twice already; stop it and record the gap';

const stateFile = (sessionId) => path.join(os.tmpdir(), `exo-refusals-${String(sessionId).replace(/[^\w-]/g, '_')}.json`);

export function normalizeCall({ tool_name: tool, tool_input: input } = {}) {
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

export function countHit({ session_id: sessionId, tool_name: tool, tool_input: input }, guard) {
  const file = stateFile(sessionId);
  const hits = readHits(file);
  const key = `${guard}|${normalizeCall({ tool_name: tool, tool_input: input })}`;
  hits[key] = (hits[key] ?? 0) + 1;
  fs.writeFileSync(file, JSON.stringify(hits));
  return hits[key];
}

function reminderText(route) {
  if (!route) return REMINDER_TEXT;
  const text = `exo: this call was refused once already; instead, ${route}`;
  return text.length > REMINDER_MAX ? `${text.slice(0, REMINDER_MAX - 1)}…` : text;
}

export function refusalText(hookInput, { guard, guardText, route }) {
  if (!hookInput?.session_id) return guardText;
  const hit = countHit(hookInput, guard);
  if (hit === 1) return guardText;
  return hit === 2 ? reminderText(route) : STOP_TEXT;
}
