import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const RULES = new URL('./dispatch-rules.md', import.meta.url);

export const dispatchMarker = (sessionId) => path.join(os.tmpdir(), `exo-dispatch-${String(sessionId).replace(/[^\w-]/g, '_')}`);

export function readDispatchRules() {
  return fs.readFileSync(RULES, 'utf8').trimEnd();
}

// why: the lead pays for these rules at its first Agent call of a session, not at session start; a subagent and a detached run session never got the session text.
export function dispatchRules({ session_id: sessionId, agent_id: agentId } = {}) {
  if (agentId || process.env.EXO_RUN_DIR || typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    fs.writeFileSync(dispatchMarker(sessionId), '', { flag: 'wx' });
    return readDispatchRules();
  } catch {
    return null;
  }
}
