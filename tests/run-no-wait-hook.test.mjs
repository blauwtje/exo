// The run-no-wait hook denies a question and blocks an end without a status
// line inside an exo run, twice per session, then lets the end pass and marks it blocked.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/run-no-wait.mjs', import.meta.url));

function runHook(t, input, env = {}) {
  const dir = env.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'exo-nowait-'));
  if (!env.dir) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clean = { ...process.env };
  delete clean.EXO_RUN;
  delete clean.EXO_RUN_DIR;
  delete clean.EXO_RUN_TASK;
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { ...clean, EXO_RUN: '1', EXO_RUN_DIR: dir, ...env.vars }, encoding: 'utf8' });
  return { dir, out: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}

const stop = (text, session = 's1') => ({ hook_event_name: 'Stop', session_id: session, last_assistant_message: text });
const ask = { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', session_id: 's1', tool_input: { questions: [{ question: 'Which branch?' }] } };

test('a question is denied with the decide-and-log reason', (t) => {
  const { out } = runHook(t, ask, { vars: { EXO_RUN_TASK: 'plan-x/1' } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /decisions\.md/);
});

test('an end without a status line is blocked, then blocked again with the BLOCKED instruction, then passes with a marker', (t) => {
  const vars = { EXO_RUN_TASK: 'plan-x/2' };
  const first = runHook(t, stop('working on it'), { vars });
  assert.equal(first.out.decision, 'block');
  assert.doesNotMatch(first.out.reason, /BLOCKED/);
  const second = runHook(t, stop('still unsure'), { dir: first.dir, vars });
  assert.equal(second.out.decision, 'block');
  assert.match(second.out.reason, /Task <n>: BLOCKED <question>/);
  const third = runHook(t, stop('no idea'), { dir: first.dir, vars });
  assert.equal(third.out, null);
  assert.equal(fs.readFileSync(path.join(first.dir, 'blocked'), 'utf8'), 'Task 2: BLOCKED no idea\n');
});

test('a status line for the task passes without a count', (t) => {
  const { dir, out } = runHook(t, stop('done\nTask 2: GREEN | diff: x'), { vars: { EXO_RUN_TASK: 'plan-x/2' } });
  assert.equal(out, null);
  assert.equal(fs.existsSync(path.join(dir, 'blocks.json')), false);
});

test('without a task only an end on a question mark is blocked', (t) => {
  assert.equal(runHook(t, stop('All verified.')).out, null);
  assert.equal(runHook(t, stop('Shall I go on?')).out.decision, 'block');
});

test('counts are per session and the end text falls back to the transcript', (t) => {
  const vars = { EXO_RUN_TASK: 'plan-x/1' };
  const first = runHook(t, stop('x', 'a'), { vars });
  const other = runHook(t, stop('x', 'b'), { dir: first.dir, vars });
  assert.doesNotMatch(other.out.reason, /BLOCKED/);
  const transcript = path.join(first.dir, 't.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Task 1: GREEN' }] } })}\n`);
  const passed = runHook(t, { hook_event_name: 'Stop', session_id: 'c', transcript_path: transcript }, { dir: first.dir, vars });
  assert.equal(passed.out, null);
});

test('outside a run the hook prints nothing', () => {
  const clean = { ...process.env };
  delete clean.EXO_RUN;
  delete clean.EXO_RUN_DIR;
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(ask), env: clean, encoding: 'utf8' });
  assert.equal(result.stdout, '');
});

test('EXO_RUN_DIR without EXO_RUN prints nothing', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-nowait-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clean = { ...process.env };
  delete clean.EXO_RUN;
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(ask), env: { ...clean, EXO_RUN_DIR: dir }, encoding: 'utf8' });
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(dir, 'blocks.json')), false);
});
