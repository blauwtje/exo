import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentHook } from '../hooks/agent-effort.mjs';
import { contextHook } from '../hooks/context-limit.mjs';
import { PREDISPATCH_STEP } from '../hooks/dispatch-bash.mjs';
import { orchestratorPredispatchReads } from '../lib/context-limits.mjs';
import { predispatchReadCount, recordSlice, sliceCount, sliceWorkers } from '../lib/slice-state.mjs';

function orchestrator(workers, reads = 'none') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-'));
  const transcript = path.join(dir, 'agent.jsonl');
  const brief = { message: { content: [{ type: 'text', text: `Workers: ${workers}\nReads: ${reads}` }] } };
  fs.writeFileSync(transcript, `${JSON.stringify(brief)}\n{}\n`);
  return { agent_id: `slice-test-${path.basename(dir)}`, agent_type: 'exo:orchestrator', agent_transcript_path: transcript, cwd: dir };
}

const dispatch = (agent) => agentHook({ ...agent, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'work', prompt: 'Reads: none\nResult: .exo/r.md' } }, 'on', () => false)?.hookSpecificOutput;

test('the slice state counts one byte per recorded dispatch and reads Workers from the first transcript line', () => {
  const agent = orchestrator(3);
  assert.equal(sliceWorkers(agent), 3);
  assert.equal(sliceCount(agent.agent_id), 0);
  recordSlice(agent.agent_id);
  assert.equal(sliceCount(agent.agent_id), 1);
  fs.rmSync(path.join(os.tmpdir(), `exo-slice-${agent.agent_id}`));
});

test('an orchestrator slice of n workers is refused at call n+1, and a refused call is not counted', () => {
  const agent = orchestrator(2);
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  const refused = dispatch(agent);
  assert.equal(refused.permissionDecision, 'deny');
  assert.match(refused.permissionDecisionReason, /sized at 2 workers/);
  assert.equal(sliceCount(agent.agent_id), 2);
  fs.rmSync(path.join(os.tmpdir(), `exo-slice-${agent.agent_id}`));
});

test('a call denied by another check is not counted', () => {
  const agent = orchestrator(2);
  const output = agentHook({ ...agent, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'no reads' } }, 'on', () => false).hookSpecificOutput;
  assert.equal(output.permissionDecision, 'deny');
  assert.equal(sliceCount(agent.agent_id), 0);
});

const cleanup = (agent) => {
  for (const kind of ['slice', 'predispatch']) fs.rmSync(path.join(os.tmpdir(), `exo-${kind}-${agent.agent_id}`), { force: true });
};

const readFile = (agent, file) => contextHook({ ...agent, tool_name: 'Read', tool_input: { file_path: file, limit: 5 } }, () => false)?.hookSpecificOutput ?? null;

test('before its first dispatch an orchestrator reads only its brief Reads paths, a capped number of times, Bash counted against that cap', () => {
  const agent = orchestrator(2, 'brief.md');
  fs.writeFileSync(path.join(agent.cwd, 'brief.md'), 'rows\n');
  fs.writeFileSync(path.join(agent.cwd, 'requirements.md'), 'rows\n');
  const offBrief = readFile(agent, 'requirements.md');
  assert.equal(offBrief.permissionDecision, 'deny');
  assert.match(offBrief.permissionDecisionReason, /reads only its brief's Reads: paths \(brief\.md\)/);
  const limit = orchestratorPredispatchReads();
  assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }), null);
  for (let read = 1; read < limit; read += 1) assert.equal(readFile(agent, path.join(agent.cwd, 'brief.md')), null);
  assert.equal(predispatchReadCount(agent.agent_id), limit);
  const overCap = readFile(agent, 'brief.md');
  assert.equal(overCap.permissionDecision, 'deny');
  assert.match(overCap.permissionDecisionReason, new RegExp(`made ${limit} Reads or Bash calls before its first dispatch`));
  assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }).hookSpecificOutput.permissionDecision, 'deny');
  recordSlice(agent.agent_id);
  assert.equal(readFile(agent, 'requirements.md'), null);
  assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }), null);
  cleanup(agent);
});

test('the pre-dispatch Read gate leaves the lead and other agent types alone', () => {
  const agent = orchestrator(2);
  fs.writeFileSync(path.join(agent.cwd, 'requirements.md'), 'rows\n');
  assert.equal(readFile({ ...agent, agent_type: 'exo:task-runner' }, 'requirements.md'), null);
  assert.equal(readFile({ cwd: agent.cwd }, path.join(agent.cwd, 'requirements.md')), null);
  assert.equal(predispatchReadCount(agent.agent_id), 0);
  cleanup(agent);
});
