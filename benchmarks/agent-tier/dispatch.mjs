import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../basics.mjs';

const CONFIG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agents.json');

export const generalKind = (agent) => readJson(CONFIG_FILE)[agent]?.kind;
export const dispatchPrompt = (agent, prompt) => (generalKind(agent) ? `exo-kind: ${generalKind(agent)}\n${prompt}` : prompt);

export function dispatchAgent(agent) {
  const entry = readJson(CONFIG_FILE)[agent];
  if (entry?.dispatch) return `exo:${entry.dispatch}`;
  return entry?.kind ? null : `exo:${agent}`;
}
