import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { briefLines } from '../lib/guard-rules.mjs';

const BUILD_ONLY_AGENT = 'exo:build-task';
const RULES = new URL('./dispatch-rules.md', import.meta.url);

export const dispatchMarker = (sessionId) => path.join(os.tmpdir(), `exo-dispatch-${String(sessionId).replace(/[^\w-]/g, '_')}`);

export function readDispatchRules(tools = null) {
  return [fs.readFileSync(RULES, 'utf8').trimEnd(), ...briefLines(tools)].join('\n');
}

export function dispatchRules({ session_id: sessionId, agent_id: agentId, tool_input: input } = {}) {
  if (input?.subagent_type === BUILD_ONLY_AGENT || agentId || process.env.EXO_RUN_DIR || typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    fs.writeFileSync(dispatchMarker(sessionId), '', { flag: 'wx' });
    return readDispatchRules();
  } catch {
    return null;
  }
}
