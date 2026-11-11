import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentHook } from '../../hooks/agent-effort.mjs';
import { orchestratorWorkers } from '../../lib/context-limits.mjs';

const STEP_FIVE = /^5\. \*\*Dispatch\*\*(.*)$/m;
const STEP_CAP = /`Workers: (\d+)` or fewer/;
const DEPTH = /CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to \d\+ for a launched run, else ([2-9])\+/;
const TOOLS_LINE = /^---\r?\n[\s\S]*?^tools:[ \t]*(.*)$/m;
const SLICE = 2;

function denied(output) {
  return output?.hookSpecificOutput?.permissionDecision === 'deny';
}

function leadOutput(dispatch, cwd, prompt) {
  const input = { tool_name: 'Agent', cwd, tool_input: { subagent_type: 'exo:orchestrator', description: 'research wave', prompt } };
  return dispatch(input, 'on', () => false);
}

function leadDispatch(dispatch, cwd, prompt) {
  return denied(leadOutput(dispatch, cwd, prompt));
}

function workerDispatch(dispatch, caller) {
  const prompt = 'Sources: repo\nReads: none\nResult: .exo/research/check/claims.md';
  const input = { ...caller, tool_name: 'Agent', tool_input: { subagent_type: 'exo:research-worker', description: 'sub-question', prompt } };
  return denied(dispatch(input, 'on', () => false));
}

function sliceOverrun(dispatch, cwd) {
  const transcript = path.join(cwd, 'agent.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: 'text', text: `Workers: ${SLICE}\nReads: none` }] } })}\n{}\n`);
  const caller = { agent_id: `research-check-${path.basename(cwd)}`, agent_type: 'exo:orchestrator', agent_transcript_path: transcript, cwd };
  try {
    return Array.from({ length: SLICE + 1 }, () => workerDispatch(dispatch, caller));
  } finally {
    fs.rmSync(path.join(os.tmpdir(), `exo-slice-${caller.agent_id}`), { force: true });
  }
}

function routingProblems(dispatch, cap) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-research-check-'));
  const limit = orchestratorWorkers();
  const found = [];
  try {
    if (cap && leadDispatch(dispatch, cwd, `Workers: ${cap}\nReads: none`)) found.push(`the step 5 \`Workers: ${cap}\` is refused for a lead dispatch`);
    if (!leadDispatch(dispatch, cwd, `Workers: ${limit + 1}\nReads: none`)) found.push(`a lead dispatch of \`exo:orchestrator\` with \`Workers: ${limit + 1}\` is allowed`);
    const unsized = leadOutput(dispatch, cwd, 'Reads: none');
    if (denied(unsized) || !unsized?.hookSpecificOutput?.additionalContext?.includes('Workers')) found.push('a lead dispatch of `exo:orchestrator` with no `Workers:` line does not run with the Workers warning');
    const slice = sliceOverrun(dispatch, cwd);
    if (slice.slice(0, SLICE).some(Boolean)) found.push(`an orchestrator sized at \`Workers: ${SLICE}\` is refused a research-worker within its slice`);
    if (!slice[SLICE]) found.push(`an orchestrator sized at \`Workers: ${SLICE}\` made ${SLICE + 1} research-worker dispatches`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  return found;
}

function tools(repository, agent) {
  const line = TOOLS_LINE.exec(repository.text(repository.join('agents', `${agent}.md`)))?.[1] ?? '';
  return line.split(/[\s,[\]]+/).filter(Boolean);
}

function agentProblems(repository) {
  const found = [];
  if (!tools(repository, 'orchestrator').includes('Agent')) found.push('the orchestrator cannot dispatch: its tools name no `Agent`');
  if (tools(repository, 'research-worker').includes('Agent')) found.push('a research-worker can spawn agents: its tools name `Agent`');
  return found;
}

function wordingProblems(step, runLoop, cap) {
  const found = [];
  if (!step.includes('`exo:orchestrator`')) found.push('research.md step 5 does not dispatch `exo:orchestrator`');
  if (!cap) found.push('research.md step 5 names no `Workers:` cap');
  if (!DEPTH.test(runLoop)) found.push('run-loop.md keeps no spawn depth of 2 or more');
  return found;
}

export function checkResearchOrchestrator(report, repository, dispatch = agentHook) {
  const step = STEP_FIVE.exec(repository.text(repository.join('skills', 'spec', 'references', 'research.md')))?.[1] ?? '';
  const runLoop = repository.text(repository.join('skills', 'build', 'references', 'run-loop.md'));
  const cap = Number(STEP_CAP.exec(step)?.[1] ?? 0);
  const found = [...wordingProblems(step, runLoop, cap), ...agentProblems(repository), ...routingProblems(dispatch, cap)];
  report.assert(
    found.length === 0,
    'research orchestrator',
    'the hook caps a research wave at one orchestrator slice of the step 5 workers, and workers spawn no agents',
    found.join('; ')
  );
}
