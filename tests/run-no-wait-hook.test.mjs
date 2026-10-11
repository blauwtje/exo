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

// Final assistant texts of the dogfood-1-3 run (stats plan), verbatim.
const TASK_1_END = "`decisions.md` already has the one decision for this task, in the required format: `- build-task-1: no test-first for sum (routine one-line reduce, spec Proof covers empty and non-empty arrays)`. There is nothing left to decide or add. Task 2 is outside this session's brief, so I'm not starting it.\n\nTask 1: LANDED 4145c32";
const TASK_2_END = "The decision is already in `decisions.md` (line 2), and no choice is open. Task 2 is landed and I did nothing further.\n\nTask 2: LANDED 83512da";
const TAIL_END = "The gate passed and both task reviews are clean. The overlap review raised one question. Nothing was pushed and no PR was opened, so nothing left the machine. Details are in `.exo/run-report.md`.\n\n**Question:** The goal says the library exports `sum` and `mean`. But `package.json` has no `main` or `exports`, and no `src/index.js` re-exports them. Should I add an entry file?\n\n- **A (best):** Add `src/index.js` and set `main` in `package.json`.\n- **B:** Leave it as is.";

test('the real task endings on LANDED pass on the first Stop without a count', (t) => {
  for (const [task, text] of [['stats/1', TASK_1_END], ['stats/2', TASK_2_END]]) {
    const { dir, out } = runHook(t, stop(text), { vars: { EXO_RUN_TASK: task } });
    assert.equal(out, null);
    assert.equal(fs.existsSync(path.join(dir, 'blocks.json')), false);
  }
});

test('the real tail ending on an open A/B question is blocked on the first Stop', (t) => {
  assert.equal(runHook(t, stop(TAIL_END)).out.decision, 'block');
});

test('without a task an option list after a question is blocked, an option list after a statement is not', (t) => {
  for (const options of ['A) Add it.\nB) Leave it.', 'A: Add it.\nB: Leave it.', '- Option A: add it.\n- Option B: leave it.', '1) Add it.\n2) Leave it.', '*A.* Add it.\n*B.* Leave it.']) {
    assert.equal(runHook(t, stop(`Should I add an entry file?\n\n${options}`)).out.decision, 'block', options);
  }
  assert.equal(runHook(t, stop('Should I go on? **Yes.**')).out, null);
  assert.equal(runHook(t, stop('Should I add an entry file?**')).out.decision, 'block');
  assert.equal(runHook(t, stop('All verified.\n\n- A: done.\n- B: done.')).out, null);
  assert.equal(runHook(t, stop('Verify passed. Gate clean, 0 findings.')).out, null);
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
