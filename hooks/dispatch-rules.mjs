import fs from 'node:fs';
import process from 'node:process';
import { tmpStateFile } from '../lib/basics.mjs';
import { briefLines } from '../lib/guard-rules.mjs';

const BUILD_ONLY_AGENT = 'exo:build-task';
const RULES = new URL('./dispatch-rules.md', import.meta.url);

export const dispatchMarker = (sessionId) => tmpStateFile('dispatch', sessionId);

export function readDispatchRules() {
  return [fs.readFileSync(RULES, 'utf8').trimEnd(), ...briefLines()].join('\n');
}

export function dispatchRules({ session_id: sessionId, agent_id: agentId, tool_input: input }) {
  if (input?.subagent_type === BUILD_ONLY_AGENT || agentId || process.env.EXO_RUN_DIR || typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    fs.writeFileSync(dispatchMarker(sessionId), '', { flag: 'wx' });
    return readDispatchRules();
  } catch {
    return null;
  }
}
