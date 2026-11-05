import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONTEXT_STEP, dispatchBash } from '../hooks/dispatch-bash.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { contextDecision, contextLimit, readCapDecision, resultCapFor, softLimit } from '../lib/context-limits.mjs';

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

test('a subagent past the soft limit is told to hand over through its result file, past the hard limit that Write still works', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-'));
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const agent_id = `a${process.pid}${Date.now()}`;
  const call = (tokens, tool_name) => contextDecision({ session_id: 'a', agent_id, agent_transcript_path: at(tokens), tool_name });
  const soft = call(softLimit(contextLimit()) + 1000, 'Bash');
  assert.match(soft.additionalContext, /exo context limit/);
  assert.match(soft.additionalContext, /result file/);
  assert.equal(call(softLimit(contextLimit()) + 1000, 'Bash'), null);
  const hard = call(contextLimit() + 1000, 'Bash');
  assert.match(hard.deny, /Write is still allowed/);
  assert.match(hard.deny, /result file/);
  assert.equal(call(contextLimit() + 1000, 'Write'), null);
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
  assert.ok(call(SOFT));
  assert.equal(call(SOFT + 1000), null);
  assert.equal(call(10_000), null);
  assert.ok(call(SOFT));
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
  assert.equal(limits.orchestratorResultCapBytes(home), 2048);
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

test('readCapDecision denies a capped type reading over its cap with the largest limit that fits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cap-'));
  const file = path.join(dir, 'big.txt');
  fs.writeFileSync(file, `${'x'.repeat(99)}\n`.repeat(100));
  const capped = { tool_name: 'Read', agent_id: 'a1', agent_type: 'exo:locate-code', tool_input: { file_path: file } };
  const denied = readCapDecision(capped);
  assert.match(denied.deny, /limit 40\b/);
  assert.equal(readCapDecision({ ...capped, tool_input: { file_path: file, limit: 40 } }), null);
  assert.equal(readCapDecision({ ...capped, tool_input: { file_path: file, pages: '1' } }), null);
  assert.equal(readCapDecision({ ...capped, agent_type: 'exo:build-task' }), null);
  assert.equal(readCapDecision({ tool_name: 'Read', tool_input: { file_path: file } }), null);
  assert.equal(resultCapFor({ ...capped, agent_type: 'exo:orchestrator' }) < resultCapFor(capped), true);
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
