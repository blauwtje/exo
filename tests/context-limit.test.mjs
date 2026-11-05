import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONTEXT_STEP, dispatchBash } from '../hooks/dispatch-bash.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { agentContextTarget, contextDecision, contextLimit, readCapDecision, softLimit } from '../lib/context-limits.mjs';

// why: node --test gives each file its own process, so this home covers the in-process calls and the spawned hook alike.
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-limit-home-'));
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

function homeWith(content) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-limit-'));
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
const AGENT_HARD = Math.round(TARGET * 1.25) + 1000;

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-main-'));
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

test('Bash and Edit dispatchers give the interactive main session no context note, and a deny still wins', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-dispatch-'));
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const saved = process.env.EXO_RUN_HANDOFF;
  delete process.env.EXO_RUN_HANDOFF;
  try {
    const limit = contextLimit();
    const soft = softLimit(limit) + 1000;
    const below = softLimit(limit) - 1000;
    const input = (tool_name, session_id, tokens) => ({ session_id, tool_name, transcript_path: at(tokens) });
    const id = `d-${process.pid}-${Date.now()}`;

    for (const tokens of [below, soft, limit + 1000]) {
      assert.equal(await dispatchBash(input('Bash', `${id}-b${tokens}`, tokens)), null);
      assert.equal(dispatchEdit(input('Edit', `${id}-e${tokens}`, tokens)), null);
    }

    const deny = { name: 'deny', run: () => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'no' } }) };
    const denied = await dispatchBash(input('Bash', `${id}-b2`, soft), [CONTEXT_STEP, deny]);
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(denied.hookSpecificOutput.additionalContext, undefined);

    process.env.EXO_RUN_HANDOFF = path.join(dir, 'handoff.md');
    assert.equal(dispatchEdit(input('Edit', `${id}-e2`, limit + 1000)).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    if (saved !== undefined) process.env.EXO_RUN_HANDOFF = saved; else delete process.env.EXO_RUN_HANDOFF;
  }
});

test('main session Read of a whole persisted tool output is denied; a range or another file passes', async () => {
  const { persistedReadDecision } = await import('../lib/context-limits.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-persisted-'));
  const transcript_path = path.join(dir, 'session.jsonl');
  const persisted = path.join(dir, 'session', 'tool-results', 'b123.txt');
  const read = (tool_input, extra = {}) => persistedReadDecision({ transcript_path, tool_name: 'Read', tool_input, ...extra });
  assert.match(read({ file_path: persisted }).deny, /offset and limit/);
  assert.equal(read({ file_path: persisted, offset: 40, limit: 30 }), null);
  assert.equal(read({ file_path: path.join(dir, 'notes.md') }), null);
  assert.equal(read({ file_path: persisted }, { agent_id: 'a1' }), null);
  assert.equal(persistedReadDecision({ transcript_path, tool_name: 'Grep', tool_input: { path: persisted } }), null);
  const hook = new URL('../hooks/context-limit.mjs', import.meta.url);
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [hook.pathname], { input: JSON.stringify({ session_id: 'p', transcript_path, tool_name: 'Read', tool_input: { file_path: persisted } }), encoding: 'utf8' });
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny');
});

test('a subagent past its soft limit is told to hand over, past its hard limit only Write and Edit still work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-'));
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const agent_id = `a${process.pid}${Date.now()}`;
  const call = (tokens, tool_name) => contextDecision({ session_id: 'a', agent_id, agent_transcript_path: at(tokens), tool_name });
  const soft = call(AGENT_SOFT, 'Bash');
  assert.match(soft.additionalContext, /exo context limit/);
  assert.match(soft.additionalContext, /result file/);
  assert.equal(call(AGENT_SOFT, 'Bash'), null);
  const hard = call(AGENT_HARD, 'Bash');
  assert.match(hard.deny, /Write and Edit are still allowed/);
  assert.match(hard.deny, /Status: handover/);
  assert.equal(call(AGENT_HARD, 'Write'), null);
  assert.equal(call(AGENT_HARD, 'Edit'), null);
});

test('a subagent is warned again after it shrinks below the soft limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-shrink-'));
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

test('replay: an agent grows past 150000 under a lead contextLimit of 150000 and is bound by agentContextTarget on the way', () => {
  const runJson = path.join(testHome, '.config', 'exo', 'run.json');
  fs.mkdirSync(path.dirname(runJson), { recursive: true });
  fs.writeFileSync(runJson, '{"defaults":{"contextLimit":150000}}');
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-growth-'));
    const agent_id = `a-growth-${process.pid}-${Date.now()}`;
    const call = (tokens, tool_name) => {
      const file = path.join(dir, `t${tokens}.jsonl`);
      fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
      return contextDecision({ session_id: 'a', agent_id, agent_transcript_path: file, tool_name });
    };
    const intake = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Skill', 'Agent', 'ToolSearch'];
    for (const tokens of [10_000, 30_000, 44_000]) for (const tool of [...intake, 'Bash', 'Write']) assert.equal(call(tokens, tool), null, `${tool} at ${tokens}`);

    const note = call(46_000, 'Bash');
    assert.match(note.additionalContext, /60k/);
    assert.match(note.additionalContext, /75k/);
    assert.match(note.additionalContext, /handover/);
    assert.equal(call(46_000, 'Bash'), null);
    for (const tool of intake) assert.equal(call(59_000, tool), null, `${tool} at 59000`);

    for (const tokens of [61_000, 74_000]) {
      for (const tool of intake) assert.match(call(tokens, tool).deny, /new reads, searches, fetches, skills and agents/, `${tool} at ${tokens}`);
      for (const tool of ['Bash', 'Write', 'Edit']) assert.equal(call(tokens, tool), null, `${tool} at ${tokens}`);
    }

    for (const tokens of [76_000, 120_000, 159_600]) {
      for (const tool of [...intake, 'Bash']) assert.match(call(tokens, tool).deny, /Status: handover/, `${tool} at ${tokens}`);
      for (const tool of ['Write', 'Edit']) assert.equal(call(tokens, tool), null, `${tool} at ${tokens}`);
    }
  } finally {
    fs.rmSync(runJson, { force: true });
  }
});

test('an Edit by a subagent past its hard limit passes the edit dispatcher', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-edit-'));
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: AGENT_HARD } } })}\n`);
  const agent_id = `a-edit-${process.pid}-${Date.now()}`;
  const input = { session_id: 'a', agent_id, agent_transcript_path: file, tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'x.txt'), old_string: 'a', new_string: 'b' } };
  const output = dispatchEdit(input, () => false);
  assert.notEqual(output?.hookSpecificOutput?.permissionDecision, 'deny');
});

test('hookAgentType reads agent_type first, else the meta file beside the subagent transcript, and strips the exo: prefix', async () => {
  const { hookAgentType } = await import('../lib/context-limits.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-type-'));
  const transcript_path = path.join(dir, 'session.jsonl');
  const subagents = path.join(dir, 'session', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:build-task' }));
  fs.writeFileSync(path.join(subagents, 'agent-a2.meta.json'), '{broken');
  fs.writeFileSync(path.join(subagents, 'agent-a3.meta.json'), JSON.stringify({ agentType: '' }));
  assert.equal(hookAgentType({ agent_id: 'a1', agent_type: 'exo:fix-review', transcript_path }), 'fix-review');
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
  const hooks = JSON.parse(fs.readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8')).hooks;
  assert.equal('SubagentStart' in hooks, false);
  assert.equal(fs.existsSync(new URL('../hooks/subagent-start.mjs', import.meta.url)), false);
  const limits = await import('../lib/context-limits.mjs');
  assert.equal('subagentStartNote' in limits, false);
});

test('agentContextTarget, dispatchBytesPerToken and fetchTokens read the catalog and honor a run.json override', async () => {
  const { agentContextTarget, dispatchBytesPerToken, fetchTokens } = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-target-'));
  assert.equal(agentContextTarget(home), 60000);
  assert.equal(dispatchBytesPerToken(home), 2);
  assert.equal(fetchTokens(home), 1600);
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { agentContextTarget: 40000, bytesPerToken: 3, fetchTokens: 2500 } }));
  assert.equal(agentContextTarget(home), 40000);
  assert.equal(dispatchBytesPerToken(home), 3);
  assert.equal(fetchTokens(home), 2500);
});

test('the slice, result cap and script size defaults read the catalog and honor a run.json override', async () => {
  const limits = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sizes-'));
  assert.equal(limits.orchestratorWorkers(home), 4);
  assert.equal(limits.resultCapBytes(home), 4096);
  assert.equal(limits.orchestratorResultCapBytes(home), (limits.agentContextTarget(home) / 2) * limits.dispatchBytesPerToken(home) / (limits.orchestratorWorkers(home) + limits.orchestratorPredispatchReads(home)));
  assert.equal(limits.scriptBytes(home), 4096);
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { orchestratorWorkers: 3, resultCapBytes: 1, orchestratorResultCapBytes: 2, scriptBytes: 5 } }));
  assert.equal(limits.orchestratorWorkers(home), 3);
  assert.equal(limits.resultCapBytes(home), 1);
  assert.equal(limits.orchestratorResultCapBytes(home), 2);
  assert.equal(limits.scriptBytes(home), 5);
});

test('the shared reader accepts a fractional bytesPerToken and rejects zero, negative and non-numeric values', async () => {
  const { dispatchBytesPerToken, capHeadroomTokens } = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-reader-'));
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

test('readCapDecision runs a capped Read with the largest limit that fits instead of denying it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cap-'));
  const file = path.join(dir, 'big.txt');
  fs.writeFileSync(file, `${'x'.repeat(99)}\n`.repeat(100));
  const capped = { tool_name: 'Read', agent_id: 'a1', agent_type: 'exo:locate-code', permission_mode: 'bypassPermissions', tool_input: { file_path: file } };
  const corrected = readCapDecision(capped);
  assert.equal(corrected.deny, undefined);
  assert.deepEqual(corrected.updatedInput, { file_path: file, offset: 1, limit: 40 });
  assert.match(corrected.additionalContext, /lines 1-40 .*offset 41/);
  assert.deepEqual(readCapDecision({ ...capped, tool_input: { file_path: file, offset: 41 } }).updatedInput, { file_path: file, offset: 41, limit: 40 });
  assert.equal(readCapDecision({ ...capped, tool_input: { file_path: file, limit: 40 } }), null);
  assert.equal(readCapDecision({ ...capped, tool_input: { file_path: file, pages: '1' } }), null);
  assert.equal(readCapDecision({ ...capped, agent_type: 'exo:build-task' }), null);
  assert.equal(readCapDecision({ tool_name: 'Read', tool_input: { file_path: file } }), null);
});

test('a Read whose single line is over the cap is not told to retry with limit 1', () => {
  const file = path.join(os.tmpdir(), `exo-long-line-${process.pid}.log`);
  fs.writeFileSync(file, `${'x'.repeat(20000)}\n`);
  try {
    const decision = readCapDecision({ tool_name: 'Read', agent_type: 'exo:locate-code', agent_id: 'a', tool_input: { file_path: file, offset: 1, limit: 1 } });
    assert.ok(decision?.deny);
    assert.doesNotMatch(decision.deny, /limit 1/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

function agentCaller(tokens, agent_type) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-caller-'));
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  const agent_id = `a-caller-${process.pid}-${Date.now()}-${Math.random()}`;
  return (tool_name) => contextDecision({ session_id: 'a', agent_id, agent_type, agent_transcript_path: file, tool_name });
}

test('an orchestrator over the target still dispatches and stops workers but cannot read', () => {
  const call = agentCaller(TARGET + 1000, 'exo:orchestrator');
  for (const tool of ['Agent', 'SendMessage', 'Monitor', 'TaskStop']) assert.equal(call(tool)?.deny, undefined, tool);
  assert.match(call('Read').deny, /new reads, searches, fetches, skills and agents/);
  assert.match(call('Grep').deny, /new reads/);
});

test('an orchestrator past the hard limit cannot dispatch', () => {
  const call = agentCaller(AGENT_HARD, 'exo:orchestrator');
  for (const tool of ['Agent', 'SendMessage', 'Monitor']) assert.match(call(tool).deny, /Status: handover/, tool);
});

test('a task-runner over the target still dispatches an agent but cannot read', () => {
  const call = agentCaller(TARGET + 1000, 'exo:task-runner');
  assert.equal(call('Agent')?.deny, undefined);
  assert.equal(call('SendMessage')?.deny, undefined);
  assert.match(call('Read').deny, /new reads/);
});

test('an agent that is not a coordinator is still refused Agent over the target', () => {
  for (const type of ['exo:build-task', 'general-purpose', undefined]) {
    const call = agentCaller(TARGET + 1000, type);
    assert.match(call('Agent').deny, /new reads, searches, fetches, skills and agents/, String(type));
  }
});

test('TaskStop stays allowed for any agent at the hard limit while Bash is refused', () => {
  for (const type of ['exo:build-task', 'exo:orchestrator', undefined]) {
    const call = agentCaller(AGENT_HARD, type);
    assert.equal(call('TaskStop'), null, String(type));
    assert.equal(call('Write'), null, String(type));
    assert.match(call('Bash').deny, /Status: handover/, String(type));
  }
});

test('imageTokenCap, pdfPageTokens and binaryReadTokens read the catalog and honor a run.json override', async () => {
  const { imageTokenCap, pdfPageTokens, binaryReadTokens } = await import('../lib/context-limits.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'read-defaults-'));
  assert.deepEqual([imageTokenCap(home), pdfPageTokens(home), binaryReadTokens(home)], [1600, 3000, 500]);
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { imageTokenCap: 900, pdfPageTokens: 2000, binaryReadTokens: 100 } }));
  assert.deepEqual([imageTokenCap(home), pdfPageTokens(home), binaryReadTokens(home)], [900, 2000, 100]);
});
