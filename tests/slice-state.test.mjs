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
import { tempDir } from './harness.mjs';

function orchestrator(workers, reads = 'none', extra = '') {
  const dir = tempDir('slice-');
  const transcript = path.join(dir, 'agent.jsonl');
  const brief = { message: { content: [{ type: 'text', text: `Workers: ${workers}\n${extra}Reads: ${reads}` }] } };
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

test('an orchestrator slice of n workers is refused at call n+1, and a noted call is counted', () => {
  const agent = orchestrator(2);
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  const refused = dispatch(agent);
  assert.ok(refused.additionalContext);
  assert.match(refused.additionalContext, /sized at 2 workers/);
  assert.equal(sliceCount(agent.agent_id), 3);
  fs.rmSync(path.join(os.tmpdir(), `exo-slice-${agent.agent_id}`));
});

const hear = (agent, entry) => fs.appendFileSync(agent.agent_transcript_path, `${JSON.stringify(entry)}\n`);
const leadSays = (text) => ({ type: 'user', message: { role: 'user', content: `The coordinator sent a message while you were working:\n${text}` }, origin: { kind: 'coordinator' } });
const queuedFrom = (kind, text) => ({ type: 'attachment', attachment: { type: 'queued_command', prompt: text, origin: { kind } } });

test('a Workers line in a later lead message to the orchestrator replaces the slice worker count', () => {
  const agent = orchestrator(2);
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  hear(agent, leadSays('Workers: 3\nOne more worker is needed.'));
  assert.equal(sliceWorkers(agent), 3);
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  assert.equal(dispatch(agent).permissionDecision, 'allow');
  const refused = dispatch(agent);
  assert.ok(refused.additionalContext);
  assert.match(refused.additionalContext, /sized at 3 workers/);
  cleanup(agent);
});

test('a lead message delivered while the orchestrator works counts, and the latest valid Workers line wins', () => {
  const agent = orchestrator(2);
  hear(agent, queuedFrom('coordinator', 'Workers: 4'));
  assert.equal(sliceWorkers(agent), 4);
  hear(agent, leadSays('Workers: 1'));
  assert.equal(sliceWorkers(agent), 1);
});

test('a Workers line from a worker, a notification or a number above the limit leaves the slice count alone', () => {
  const agent = orchestrator(2);
  hear(agent, queuedFrom('peer', 'Workers: 4'));
  hear(agent, { ...leadSays('Workers: 4'), origin: { kind: 'peer', from: 'worker-id' } });
  hear(agent, queuedFrom('task-notification', 'Workers: 3'));
  hear(agent, leadSays('Workers: 9'));
  hear(agent, leadSays('Workers: many'));
  assert.equal(sliceWorkers(agent), 2);
});

test('a call noted by another check is counted', () => {
  const agent = orchestrator(2);
  fs.mkdirSync(path.join(agent.cwd, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(agent.cwd, '.claude', 'agents', 'reader.md'), '---\nname: reader\ntools: Read, Grep\n---\nbody\n');
  const output = agentHook({ ...agent, tool_name: 'Agent', tool_input: { subagent_type: 'reader', prompt: 'Reads: none\nResult: .exo/r.md' } }, 'on', () => false).hookSpecificOutput;
  assert.ok(output.additionalContext);
  assert.equal(sliceCount(agent.agent_id), 1);
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
  assert.ok(offBrief.additionalContext);
  assert.match(offBrief.additionalContext, /reads only its brief's Reads: paths \(brief\.md\)/);
  const limit = orchestratorPredispatchReads() + 2;
  assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }), null);
  for (let read = 1; read < limit; read += 1) assert.equal(readFile(agent, path.join(agent.cwd, 'brief.md')), null);
  assert.equal(predispatchReadCount(agent.agent_id), limit);
  const overCap = readFile(agent, 'brief.md');
  assert.ok(overCap.additionalContext);
  assert.match(overCap.additionalContext, new RegExp(`made ${limit} Reads or Bash calls before its first dispatch`));
  assert.ok(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }).hookSpecificOutput.additionalContext);
  recordSlice(agent.agent_id);
  assert.equal(readFile(agent, 'requirements.md'), null);
  assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }), null);
  cleanup(agent);
});

test('an orchestrator reads its brief Reads paths from the brief Worktree', () => {
  const tree = tempDir('slice-tree-');
  fs.writeFileSync(path.join(tree, 'brief.md'), 'rows\n');
  const agent = orchestrator(2, 'brief.md', `Worktree: ${tree}\n`);
  assert.equal(readFile(agent, path.join(tree, 'brief.md')), null);
  assert.ok(readFile(agent, path.join(agent.cwd, 'brief.md')).additionalContext);
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

const template = path.resolve(import.meta.dirname, '../lib/assets/handover-template.md');

test('before its first dispatch an orchestrator may read the handover template, and its cap grows by the Reads paths plus the template', () => {
  const agent = orchestrator(2, 'a.md, b.md, c.md');
  for (const name of ['a.md', 'b.md', 'c.md']) fs.writeFileSync(path.join(agent.cwd, name), 'rows\n');
  assert.equal(readFile(agent, template), null);
  const limit = orchestratorPredispatchReads() + 4;
  for (let call = 2; call <= limit; call += 1) assert.equal(readFile(agent, path.join(agent.cwd, 'a.md')), null, `call ${call}`);
  assert.equal(predispatchReadCount(agent.agent_id), limit);
  const over = readFile(agent, path.join(agent.cwd, 'b.md'));
  assert.ok(over.additionalContext);
  assert.match(over.additionalContext, new RegExp(`made ${limit} Reads or Bash calls`));
  cleanup(agent);
});

test('an orchestrator with Reads none may still read the handover template, and a Bash call past its cap is refused', () => {
  const agent = orchestrator(2);
  assert.equal(readFile(agent, template), null);
  const limit = orchestratorPredispatchReads() + 1;
  for (let call = 2; call <= limit; call += 1) assert.equal(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }), null);
  assert.ok(PREDISPATCH_STEP.run({ ...agent, tool_input: { command: 'ls' } }).hookSpecificOutput.additionalContext);
  cleanup(agent);
});

const skillsDir = path.resolve(import.meta.dirname, '../skills');

function forkedSkill(name) {
  const dir = tempDir('slice-skill-');
  const transcript = path.join(dir, 'agent.jsonl');
  const body = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const text = `Base directory for this skill: ${path.join(skillsDir, name)}\n\n${body}\n\nARGUMENTS: plan.md`;
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: 'text', text }] } })}\n{}\n`);
  return { agent_id: `slice-test-${path.basename(dir)}`, agent_type: 'exo:orchestrator', agent_transcript_path: transcript, cwd: dir };
}

test('before its first dispatch a forked skill orchestrator reads the references its skill body names, and nothing else', () => {
  const agent = forkedSkill('build');
  assert.equal(readFile(agent, path.join(skillsDir, 'build/references/run-loop.md')), null);
  assert.equal(readFile(agent, path.join(skillsDir, 'build/references/workspace.md')), null);
  assert.ok(readFile(agent, path.resolve(skillsDir, '../lib/slice-state.mjs')).additionalContext);
  cleanup(agent);
});
