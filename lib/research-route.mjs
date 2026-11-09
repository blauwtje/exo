import { denyReason } from './guard-rules.mjs';
import { readKindTable } from './model-kinds.mjs';
import { environmentMs } from './script-flags.mjs';
import { recordResearch, researchAgeMs } from './slice-state.mjs';
import { webSources } from '#worker-size';

const isFetchSized = (table, type) => (table.fetchSized ?? []).includes(type);
const isUnnamed = (table, type) => table.unnamed.types.includes(type ?? 'general-purpose');

function isMainResearch(hookInput) {
  const { tool_name: tool, tool_input: input, agent_id: agentId, session_id: sessionId } = hookInput;
  if (tool !== 'Agent' || !input || agentId || !sessionId || !webSources(input.prompt)) return false;
  const table = readKindTable();
  return isFetchSized(table, input.subagent_type) || isUnnamed(table, input.subagent_type);
}

const PAGE_CUT = /\bhead\s+(?:-c|--bytes)|\bcut\s+-c/;

function cutsPage(hookInput) {
  const input = hookInput.tool_input;
  return hookInput.tool_name === 'Agent' && input?.subagent_type === 'exo:research-worker' && PAGE_CUT.test(input.prompt ?? '');
}

export function researchFields(hookInput) {
  if (cutsPage(hookInput)) return { permissionDecision: 'deny', permissionDecisionReason: denyReason('brief-cuts-page') };
  if (!isMainResearch(hookInput)) return null;
  if (isUnnamed(readKindTable(), hookInput.tool_input.subagent_type)) return { permissionDecision: 'deny', permissionDecisionReason: denyReason('research-unnamed') };
  if (researchAgeMs(hookInput.session_id) >= environmentMs('EXO_RESEARCH_FANOUT_MS', 30_000)) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('research-fanout') };
}

export function recordResearchDispatch(hookInput) {
  if (isMainResearch(hookInput)) recordResearch(hookInput.session_id);
}
