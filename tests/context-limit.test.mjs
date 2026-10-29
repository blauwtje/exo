import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONTEXT_STEP, dispatchBash } from '../hooks/dispatch-bash.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { contextDecision, contextLimit, softLimit, subagentStartNote } from '../lib/context-limits.mjs';

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
    assert.match(subagentStartNote(), /30k.*40k/s);
  } finally {
    process.env.HOME = saved;
  }
});

test('main session gets one note per level and is never denied', () => {
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
    assert.equal(call(10_000), null);
    const soft = call(SOFT);
    assert.match(soft.additionalContext, /subagents/);
    assert.match(soft.additionalContext, /manager subagent/);
    assert.doesNotMatch(soft.additionalContext, /save-session|fresh session/);
    assert.ok(soft.additionalContext.indexOf('progress.md') >= 0);
    assert.ok(soft.additionalContext.indexOf('progress.md') < soft.additionalContext.indexOf('subagents'));
    assert.match(soft.additionalContext, /decisions, open points and next step in this turn/);
    assert.equal(call(SOFT + 1000), null);
    const hard = call(HARD);
    assert.ok(hard.additionalContext.indexOf('progress.md') >= 0);
    assert.ok(hard.additionalContext.indexOf('progress.md') < hard.additionalContext.indexOf('subagents'));
    assert.match(hard.additionalContext, /decisions, open points and next step in this turn/);
    assert.match(hard.additionalContext, /remaining work to subagents/);
    assert.match(hard.additionalContext, /only decisions and user dialogue/);
    assert.doesNotMatch(hard.additionalContext, /save-session|fresh session/);
    assert.equal(hard.deny, undefined);
    assert.equal(call(HARD + 1000), null);
  } finally {
    if (savedRun !== undefined) process.env.EXO_RUN_HANDOFF = savedRun;
  }
});

test('main session is warned again after it shrinks below the soft limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-shrink-'));
  const at = (tokens) => {
    const file = path.join(dir, `t${tokens}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
    return file;
  };
  const savedRun = process.env.EXO_RUN_HANDOFF;
  delete process.env.EXO_RUN_HANDOFF;
  try {
    const session_id = `s-shrink-${process.pid}-${Date.now()}`;
    const call = (tokens) => contextDecision({ session_id, transcript_path: at(tokens), tool_name: 'Read' });
    assert.ok(call(SOFT));
    assert.equal(call(SOFT + 1000), null);
    assert.equal(call(10_000), null);
    assert.ok(call(SOFT));
  } finally {
    if (savedRun !== undefined) process.env.EXO_RUN_HANDOFF = savedRun;
  }
});

test('Bash and Edit dispatchers give the main session one soft note above the soft limit, none below it, and a deny still wins', async () => {
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

    assert.equal(await dispatchBash(input('Bash', `${id}-b0`, below)), null);
    const bash = await dispatchBash(input('Bash', `${id}-b1`, soft));
    assert.doesNotMatch(bash.hookSpecificOutput.additionalContext, /save-session|fresh session/);
    assert.equal(await dispatchBash(input('Bash', `${id}-b1`, soft)), null);

    assert.equal(dispatchEdit(input('Edit', `${id}-e0`, below)), null);
    const edit = dispatchEdit(input('Edit', `${id}-e1`, soft));
    assert.doesNotMatch(edit.hookSpecificOutput.additionalContext, /save-session|fresh session/);
    assert.equal(dispatchEdit(input('Edit', `${id}-e1`, soft)), null);

    const deny = { name: 'deny', run: () => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'no' } }) };
    const denied = await dispatchBash(input('Bash', `${id}-b2`, soft), [CONTEXT_STEP, deny]);
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.doesNotMatch(denied.hookSpecificOutput.additionalContext, /save-session|fresh session/);

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
  const call = (tokens, tool_name) => contextDecision({ session_id: 'a', agent_id: 'a1', agent_transcript_path: at(tokens), tool_name });
  const soft = call(softLimit(contextLimit()) + 1000, 'Bash');
  assert.match(soft.additionalContext, /exo context limit/);
  assert.match(soft.additionalContext, /result file/);
  const hard = call(contextLimit() + 1000, 'Bash');
  assert.match(hard.deny, /Write is still allowed/);
  assert.match(hard.deny, /result file/);
  assert.equal(call(contextLimit() + 1000, 'Write'), null);
});

test('the SubagentStart hook gives every subagent the limits and the hand-over route in its own start context', async () => {
  const { execFileSync } = await import('node:child_process');
  const hook = new URL('../hooks/subagent-start.mjs', import.meta.url);
  const out = JSON.parse(execFileSync(process.execPath, [hook.pathname], { input: '{}', encoding: 'utf8' }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.equal(out.hookSpecificOutput.additionalContext, subagentStartNote());
  const soft = `${softLimit(contextLimit()) / 1000}k`;
  const hard = `${contextLimit() / 1000}k`;
  assert.ok(subagentStartNote().includes(`From ${soft}`) && subagentStartNote().includes(`Past ${hard}`));
  assert.match(subagentStartNote(), /except Write.*result file/s);
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
