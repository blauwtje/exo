import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { agentHook } from '../hooks/agent-effort.mjs';
import { contextHook } from '../hooks/context-limit.mjs';
import { AGENT_HARD_RATIO, agentContextTarget, contextLimit, softLimit } from '../lib/context-limits.mjs';
import { contextDecision, contextFields, readCapDecision } from '../lib/context-decisions.mjs';
import { guardKind } from '../lib/guard-rules.mjs';
import { readHooks, tempDir } from './harness.mjs';

const testHome = tempDir('exo-limit-home-');
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

function homeWith(content) {
  const home = tempDir('exo-limit-');
  if (content !== undefined) {
    fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), content);
  }
  return home;
}

const catalogLimit = JSON.parse(fs.readFileSync(new URL('../lib/run-providers.json', import.meta.url), 'utf8')).defaults.contextLimit;
const SOFT = softLimit(catalogLimit) + 1000;
const HARD = catalogLimit + 1000;
const TARGET = agentContextTarget();
const AGENT_SOFT = softLimit(TARGET) + 1000;
const AGENT_HARD = Math.round(TARGET * AGENT_HARD_RATIO) + 1000;

test('contextLimit is the catalog default when run.json sets none', () => {
  assert.equal(contextLimit(homeWith()), catalogLimit);
  assert.equal(contextLimit(homeWith('{"defaults":{}}')), catalogLimit);
});

test('a run.json defaults.contextLimit overrides the catalog default', () => {
  assert.equal(contextLimit(homeWith('{"defaults":{"contextLimit":200000}}')), 200_000);
});

test('an invalid run.json contextLimit falls back to the catalog default', () => {
  for (const bad of ['{"defaults":{"contextLimit":0}}', '{"defaults":{"contextLimit":-5}}', '{"defaults":{"contextLimit":"big"}}', '{"defaults":{"contextLimit":1.5}}', 'not json']) {
    assert.equal(contextLimit(homeWith(bad)), catalogLimit);
  }
});

test('softLimit is 75% of the limit', () => {
  assert.equal(softLimit(80_000), 60_000);
  assert.equal(softLimit(120_000), 90_000);
});

test('the hook limit follows an overriding run.json', () => {
  const home = homeWith('{"defaults":{"contextLimit":40000}}');
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    assert.equal(contextLimit(), 40_000);
  } finally {
    process.env.HOME = saved;
  }
});

test('the interactive main session gets no note and no refusal at any context size', () => {
  const dir = tempDir('exo-main-');
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const savedRun = process.env.EXO_RUN_HANDOFF;
  delete process.env.EXO_RUN_HANDOFF;
  try {
    const session_id = `s-${process.pid}-${Date.now()}`;
    const call = (tokens) => contextDecision({ session_id, transcript_path: at(tokens), tool_name: 'Read' });
    for (const tokens of [10_000, SOFT, SOFT + 1000, HARD, HARD + 1000]) assert.equal(call(tokens), null);
  } finally {
    if (savedRun !== undefined) process.env.EXO_RUN_HANDOFF = savedRun;
  }
});

test('a subagent past its soft limit is told to hand over, past its hard limit is told on every call to hand over, not refused', () => {
  const dir = tempDir('exo-agent-');
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const agent_id = `a${process.pid}${Date.now()}`;
  const call = (tokens, tool_name) => contextDecision({ session_id: 'a', agent_id, agent_transcript_path: at(tokens), tool_name });
  const soft = call(AGENT_SOFT, 'Bash');
  assert.match(soft.additionalContext, /exo context limit/);
  assert.match(soft.additionalContext, /handover/);
  assert.equal(call(AGENT_SOFT, 'Bash'), null);
  const hard = call(AGENT_HARD, 'Read');
  assert.equal(hard.note.includes('Over the hard context limit: hand over now'), true);
  assert.match(hard.note, /checkpoint\.mjs/);
  assert.match(hard.note, /Status: handover/);
  const fields = contextFields(hard, { session_id: `hard-note-${process.pid}-${Date.now()}` });
  assert.equal(fields.permissionDecision, undefined);
  assert.match(fields.additionalContext, /checkpoint\.mjs/);
  const again = { session_id: `hard-repeat-${process.pid}` };
  assert.ok(contextFields(hard, again));
  assert.ok(contextFields(hard, again));
  assert.equal(call(AGENT_HARD, 'Bash').note.includes('new reads'), false);
  assert.match(call(AGENT_HARD, 'Read').note, /new reads, skills and agents stay refused/);
});

test('a subagent is warned again after it shrinks below the soft limit', () => {
  const dir = tempDir('exo-agent-shrink-');
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const agent_id = `a-shrink-${process.pid}-${Date.now()}`;
  const call = (tokens) => contextDecision({ session_id: 'a', agent_id, agent_transcript_path: at(tokens), tool_name: 'Bash' });
  assert.ok(call(AGENT_SOFT));
  assert.equal(call(AGENT_SOFT + 1000), null);
  assert.equal(call(10_000), null);
  assert.ok(call(AGENT_SOFT));
});

function assertTargetWarns(call, tools, tokens) {
  for (const tool of tools) assert.match(call(tokens, tool).deny, /new reads, skills and agents/, `${tool} at ${tokens}`);
}

function assertAllow(call, tools, tokens) {
  for (const tool of tools) assert.equal(call(tokens, tool), null, `${tool} at ${tokens}`);
}

function assertHandover(call, tools, tokens) {
  for (const tool of tools) assert.match(call(tokens, tool).note ?? call(tokens, tool).deny, /Status: handover/, `${tool} at ${tokens}`);
}

function growthCall(dir, agent_id) {
  return (tokens, tool_name) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return contextDecision({ session_id: 'a', agent_id, agent_transcript_path: file, tool_name });
  };
}

function assertGrowthBands(call) {
  const intake = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Skill', 'Agent', 'ToolSearch'];
  for (const tokens of [10_000, 30_000, 44_000]) assertAllow(call, [...intake, 'Bash', 'Write'], tokens);
  const note = call(46_000, 'Bash');
  assert.match(note.additionalContext, /60k/);
  assert.match(note.additionalContext, /75k/);
  assert.match(note.additionalContext, /handover/);
  assert.equal(call(46_000, 'Bash'), null);
  assertAllow(call, intake, 59_000);
  for (const tokens of [61_000, 74_000]) {
    assertTargetWarns(call, intake, tokens);
    assertAllow(call, ['Bash', 'Write', 'Edit'], tokens);
  }
  for (const tokens of [76_000, 120_000, 159_600]) {
    assertHandover(call, [...intake, 'Bash', 'Write', 'Edit'], tokens);
  }
}

test('replay: an agent grows past 150000 under a lead contextLimit of 150000 and is bound by agentContextTarget on the way', () => {
  const runJson = path.join(testHome, '.config', 'exo', 'run.json');
  fs.mkdirSync(path.dirname(runJson), { recursive: true });
  fs.writeFileSync(runJson, '{"defaults":{"contextLimit":150000}}');
  try {
    assertGrowthBands(growthCall(tempDir('exo-growth-'), `a-growth-${process.pid}-${Date.now()}`));
  } finally {
    fs.rmSync(runJson, { force: true });
  }
});

test('hookAgentType reads agent_type first, else the meta file beside the subagent transcript, and strips the exo: prefix', async () => {
  const { hookAgentType } = await import('../lib/context-decisions.mjs');
  const dir = tempDir('exo-agent-type-');
  const transcript_path = path.join(dir, 'session.jsonl');
  const subagents = path.join(dir, 'session', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:build-task' }));
  fs.writeFileSync(path.join(subagents, 'agent-a2.meta.json'), '{broken');
  fs.writeFileSync(path.join(subagents, 'agent-a3.meta.json'), JSON.stringify({ agentType: '' }));
  assert.equal(hookAgentType({ agent_id: 'a1', agent_type: 'exo:review-branch', transcript_path }), 'review-branch');
  assert.equal(hookAgentType({ agent_id: 'a1', agent_type: 'build-task', transcript_path }), 'build-task');
  assert.equal(hookAgentType({ agent_id: 'a1', transcript_path }), 'build-task');
  assert.equal(hookAgentType({ agent_id: 'a1', agent_transcript_path: path.join(subagents, 'agent-a1.jsonl') }), 'build-task');
  assert.equal(hookAgentType({ agent_id: 'a2', transcript_path }), null);
  assert.equal(hookAgentType({ agent_id: 'a3', transcript_path }), null);
  assert.equal(hookAgentType({ agent_id: 'missing', transcript_path }), null);
  assert.equal(hookAgentType({ transcript_path }), null);
  assert.equal(hookAgentType({}), null);
  assert.equal(hookAgentType(undefined), null);
});

test('the SubagentStart hook, its file and subagentStartNote are gone', async () => {
  const hooks = readHooks();
  assert.equal('SubagentStart' in hooks, false);
  assert.equal(fs.existsSync(new URL('../hooks/subagent-start.mjs', import.meta.url)), false);
  const limits = await import('../lib/context-limits.mjs');
  assert.equal('subagentStartNote' in limits, false);
});

test('agentContextTarget, dispatchBytesPerToken and fetchTokens read the catalog and honor a run.json override', async () => {
  const { agentContextTarget, dispatchBytesPerToken, fetchTokens } = await import('../lib/context-limits.mjs');
  const home = tempDir('exo-target-');
  assert.equal(agentContextTarget(home), 60000);
  assert.equal(dispatchBytesPerToken(home), 2);
  assert.equal(fetchTokens(home), 1600);
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { agentContextTarget: 40000, bytesPerToken: 3, fetchTokens: 2500 } }));
  assert.equal(agentContextTarget(home), 40000);
  assert.equal(dispatchBytesPerToken(home), 3);
  assert.equal(fetchTokens(home), 2500);
});

test('the slice and result cap defaults read the catalog and honor a run.json override', async () => {
  const limits = await import('../lib/context-limits.mjs');
  const home = tempDir('exo-sizes-');
  assert.equal(limits.orchestratorWorkers(home), 4);
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { orchestratorWorkers: 3 } }));
    assert.equal(limits.orchestratorWorkers(home), 3);
  } finally {
    process.env.HOME = saved;
  }
});

test('the shared reader accepts a fractional bytesPerToken and rejects zero, negative and non-numeric values', async () => {
  const { dispatchBytesPerToken, capHeadroomTokens } = await import('../lib/context-limits.mjs');
  const home = tempDir('exo-reader-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  const write = (defaults) => fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults }));
  write({ bytesPerToken: 1.85 });
  assert.equal(dispatchBytesPerToken(home), 1.85);
  write({ bytesPerToken: 0, capHeadroomTokens: -5 });
  assert.equal(dispatchBytesPerToken(home), 2);
  assert.equal(capHeadroomTokens(home), 50);
  write({ bytesPerToken: '3' });
  assert.equal(dispatchBytesPerToken(home), 2);
});

function roomCaller(tokens, extra = {}) {
  const dir = tempDir('exo-room-');
  const transcript = path.join(dir, 'agent.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  return { tool_name: 'Read', agent_id: 'a1', agent_type: 'exo:research-worker', permission_mode: 'bypassPermissions', agent_transcript_path: transcript, ...extra };
}

test('readCapDecision runs a Read with the largest limit that fits the room left instead of denying it', () => {
  const dir = tempDir('exo-cap-');
  const file = path.join(dir, 'big.txt');
  fs.writeFileSync(file, `${'x'.repeat(99)}\n`.repeat(100));
  const caller = roomCaller(60000 - 2250);
  const corrected = readCapDecision({ ...caller, tool_input: { file_path: file } });
  assert.equal(corrected.deny, undefined);
  assert.deepEqual(corrected.updatedInput, { file_path: file, offset: 1, limit: 45 });
  assert.match(corrected.additionalContext, /lines 1-45 .*offset 46/);
  assert.deepEqual(readCapDecision({ ...caller, tool_input: { file_path: file, offset: 41 } }).updatedInput, { file_path: file, offset: 41, limit: 45 });
  assert.equal(readCapDecision({ ...caller, tool_input: { file_path: file, limit: 40 } }), null);
  assert.equal(readCapDecision({ ...caller, tool_input: { file_path: file, pages: '1' } }), null);
  assert.equal(readCapDecision({ tool_name: 'Read', tool_input: { file_path: file } }), null);
  assert.equal(readCapDecision({ ...roomCaller(1000), tool_input: { file_path: file } }), null, 'a Read with the whole room left runs as asked');
  const resultFile = path.join(dir, '.exo', 'part', 'result.md');
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, `${'x'.repeat(99)}\n`.repeat(100));
  const orchestrator = roomCaller(60000 - 2250, { agent_type: 'exo:orchestrator' });
  assert.equal(readCapDecision({ ...orchestrator, tool_input: { file_path: resultFile } }), null, 'an orchestrator reads a worker Result file whole');
  assert.ok(readCapDecision({ ...orchestrator, tool_input: { file_path: file } }).updatedInput, 'an orchestrator read outside .exo is still cut');
  assert.ok(readCapDecision({ ...caller, tool_input: { file_path: resultFile } }).updatedInput, 'a worker read of a .exo file is still cut');
});

test('a Read whose single line is over the room left is not told to retry with limit 1', () => {
  const file = path.join(os.tmpdir(), `exo-long-line-${process.pid}.log`);
  fs.writeFileSync(file, `${'x'.repeat(20000)}\n`);
  try {
    const decision = readCapDecision({ ...roomCaller(60000 - 2250), tool_input: { file_path: file, offset: 1, limit: 1 } });
    assert.ok(decision?.deny);
    assert.doesNotMatch(decision.deny, /limit 1/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

function agentCaller(tokens, agent_type) {
  const dir = tempDir('exo-caller-');
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  const agent_id = `a-caller-${process.pid}-${Date.now()}-${Math.random()}`;
  return (tool_name) => contextDecision({ session_id: 'a', agent_id, agent_type, agent_transcript_path: file, tool_name });
}

test('an orchestrator over the target still dispatches and stops workers but cannot read', () => {
  const call = agentCaller(TARGET + 1000, 'exo:orchestrator');
  for (const tool of ['Agent', 'SendMessage', 'Monitor', 'TaskStop']) assert.equal(call(tool)?.deny, undefined, tool);
  assert.match(call('Read').deny, /new reads, skills and agents/);
  assert.match(call('Grep').deny, /new reads/);
});

test('an orchestrator past the hard limit is told to hand over on Agent', () => {
  const call = agentCaller(AGENT_HARD, 'exo:orchestrator');
  assert.match(call('Agent').note, /Status: handover/);
  assert.match(call('Read').note, /new reads, skills and agents stay refused/);
  assert.doesNotMatch(call('Monitor').note, /stay refused/);
});

test('past the hard limit the hook repeats the hand-over note and skips the checkpoint call', () => {
  const file = path.join(tempDir('exo-hard-hook-'), 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: AGENT_HARD } } })}\n`);
  const input = (tool_name, tool_input = {}) => ({ session_id: `hard-hook-${process.pid}`, agent_id: 'ha', agent_type: 'exo:orchestrator', agent_transcript_path: file, tool_name, tool_input });
  for (const tool of ['Agent', 'SendMessage', 'Monitor']) {
    for (let i = 0; i < 2; i += 1) {
      const output = agentHook(input(tool, { subagent_type: 'exo:build-task', prompt: 'x' }), 'off', () => false);
      assert.match(output?.hookSpecificOutput?.additionalContext ?? '', /hand over now/, tool);
      assert.notEqual(output.hookSpecificOutput.permissionDecision, 'deny', tool);
    }
  }
  const checkpoint = contextHook(input('Bash', { command: 'node skills/build/scripts/checkpoint.mjs' }), () => false);
  assert.equal(checkpoint, null);
});

test('an agent that is not a coordinator is still refused Agent over the target', () => {
  for (const type of ['exo:build-task', 'general-purpose', undefined]) {
    const call = agentCaller(TARGET + 1000, type);
    assert.match(call('Agent').deny, /new reads, skills and agents/, String(type));
  }
});

test('imageTokenCap, pdfPageTokens and binaryReadTokens read the catalog and honor a run.json override', async () => {
  const { imageTokenCap, pdfPageTokens, binaryReadTokens } = await import('../lib/context-limits.mjs');
  const home = tempDir('read-defaults-');
  assert.deepEqual([imageTokenCap(home), pdfPageTokens(home), binaryReadTokens(home)], [1600, 3000, 500]);
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { imageTokenCap: 900, pdfPageTokens: 2000, binaryReadTokens: 100 } }));
  assert.deepEqual([imageTokenCap(home), pdfPageTokens(home), binaryReadTokens(home)], [900, 2000, 100]);
});

test('a subagent refusal names the Result path of its brief, or the reply', () => {
  const dir = tempDir('exo-brief-');
  const refusal = (brief, tokens) => {
    const file = path.join(dir, `${Math.abs(brief.length)}-${tokens}.jsonl`);
    const user = { type: 'user', message: { content: brief } };
    const usage = { type: 'assistant', message: { usage: { input_tokens: tokens } } };
    fs.writeFileSync(file, `${JSON.stringify(user)}\n${JSON.stringify(usage)}\n`);
    return contextDecision({ session_id: 'a', agent_id: `b${process.pid}${tokens}`, agent_transcript_path: file, tool_name: 'Read' });
  };
  assert.match(refusal('Reads: none\nResult: .exo/r.md', AGENT_HARD).note, /write \.exo\/r\.md as a handover/);
  assert.match(refusal('Reads: none\nResult: reply', TARGET + 1000).deny, /reply with a handover/);
});

test('context target warns: intake past the target runs with the rule in its context', () => {
  const call = agentCaller(TARGET + 1000, 'exo:build-task');
  for (const tool of ['Read', 'Grep', 'Agent']) {
    const decision = call(tool);
    assert.equal(guardKind(decision.rule), 'warn', tool);
    assert.match(decision.deny, /new reads, skills and agents/, tool);
  }
});
