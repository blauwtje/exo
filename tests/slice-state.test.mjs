import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentHook } from '../hooks/agent-effort.mjs';
import { recordSlice, sliceCount, sliceWorkers } from '../lib/slice-state.mjs';

function orchestrator(workers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-'));
  const transcript = path.join(dir, 'agent.jsonl');
  const brief = { message: { content: [{ type: 'text', text: `Workers: ${workers}\nReads: none` }] } };
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
