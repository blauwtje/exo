import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { contextDecision, contextLimit, softLimit } from '../lib/context-limits.mjs';

function homeWith(content) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-limit-'));
  if (content !== undefined) {
    fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), content);
  }
  return home;
}

test('contextLimit reads the user override and falls back to the shipped default', () => {
  const shipped = contextLimit(homeWith());
  assert.ok(Number.isInteger(shipped) && shipped > 0);
  assert.equal(contextLimit(homeWith('{"defaults":{"contextLimit":200000}}')), 200000);
  for (const bad of ['{not json', '{"defaults":{"contextLimit":-5}}', '{"defaults":{"contextLimit":"big"}}']) {
    assert.equal(contextLimit(homeWith(bad)), shipped);
  }
});

test('softLimit is 60% of the limit', () => {
  assert.equal(softLimit(100000), 60000);
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
