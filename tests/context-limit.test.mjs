import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONTEXT_STEP, dispatchBash } from '../hooks/dispatch-bash.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { contextDecision, contextLimit, softLimit } from '../lib/context-limits.mjs';

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

test('contextLimit is the fixed 80k and ignores a leftover run.json setting', () => {
  assert.equal(contextLimit(), 80_000);
  assert.equal(contextLimit(homeWith('{"defaults":{"contextLimit":200000}}')), 80_000);
});

test('softLimit is 75% of the limit', () => {
  assert.equal(softLimit(80_000), 60_000);
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
    const soft = call(70_000);
    assert.match(soft.additionalContext, /exo:save-session/);
    assert.equal(call(71_000), null);
    const hard = call(120_000);
    assert.match(hard.additionalContext, /tell the user/);
    assert.equal(hard.deny, undefined);
    assert.equal(call(121_000), null);
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
    assert.ok(call(70_000));
    assert.equal(call(71_000), null);
    assert.equal(call(10_000), null);
    assert.ok(call(70_000));
  } finally {
    if (savedRun !== undefined) process.env.EXO_RUN_HANDOFF = savedRun;
  }
});

test('Bash and Edit dispatchers give the main session one soft note at 61k, none at 59k, and a deny still wins', async () => {
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
    assert.match(bash.hookSpecificOutput.additionalContext, /exo:save-session/);
    assert.equal(await dispatchBash(input('Bash', `${id}-b1`, soft)), null);

    assert.equal(dispatchEdit(input('Edit', `${id}-e0`, below)), null);
    const edit = dispatchEdit(input('Edit', `${id}-e1`, soft));
    assert.match(edit.hookSpecificOutput.additionalContext, /exo:save-session/);
    assert.equal(dispatchEdit(input('Edit', `${id}-e1`, soft)), null);

    const deny = { name: 'deny', run: () => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'no' } }) };
    const denied = await dispatchBash(input('Bash', `${id}-b2`, soft), [CONTEXT_STEP, deny]);
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.additionalContext, /exo:save-session/);

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
