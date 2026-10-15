import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'context-limit.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-'));
const entry = (tokens) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } });

// `agent` feeds the transcript as a subagent's own, keyed by its agent_id.
const outsideRun = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('EXO_RUN')));

function run(lines, extra = {}, { agent = false, env = outsideRun } = {}) {
  const file = path.join(dir, `t${Math.random()}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const where = agent ? { agent_id: 'a1', agent_transcript_path: file } : { transcript_path: file };
  const started = process.hrtime.bigint();
  const { stdout } = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ ...where, cwd: dir, tool_name: 'Read', ...extra }), encoding: 'utf8', env });
  return { stdout, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

test('a main session outside a detached run prints nothing at any size', () => {
  for (const tokens of [10000, 65000, 120000]) assert.equal(run([entry(tokens)]).stdout, '', String(tokens));
});

test('a detached run session over the soft limit warns, over the hard limit denies but keeps Write', () => {
  const env = { ...process.env, EXO_RUN_HANDOFF: path.join(dir, 'handoff.md'), EXO_RUN_TASK: 'plan/2' };
  const soft = JSON.parse(run([entry(65000)], {}, { env }).stdout).hookSpecificOutput;
  assert.equal(soft.hookEventName, 'PreToolUse');
  assert.match(soft.additionalContext, /land the task/);
  const hard = JSON.parse(run([entry(120000)], {}, { env }).stdout).hookSpecificOutput;
  assert.equal(hard.permissionDecision, 'deny');
  assert.match(hard.permissionDecisionReason, /Task 2: HANDOFF/);
  assert.equal(run([entry(120000)], { tool_name: 'Write' }, { env }).stdout, '');
});

test('a subagent gets no note at 55k, a finish-and-report note at 65k, and Agent denied at 120k', () => {
  assert.equal(run([entry(55000)], {}, { agent: true }).stdout, '');
  const note = JSON.parse(run([entry(65000)], {}, { agent: true }).stdout).hookSpecificOutput;
  assert.equal(note.permissionDecision, undefined);
  assert.match(note.additionalContext, /Finish your current step/);
  assert.match(note.additionalContext, /report/);
  assert.equal(run([entry(120000)], { tool_name: 'Write' }, { agent: true }).stdout, '');
  const denied = JSON.parse(run([entry(120000)], { tool_name: 'Agent' }, { agent: true }).stdout).hookSpecificOutput;
  assert.equal(denied.permissionDecision, 'deny');
  assert.match(denied.permissionDecisionReason, /report/);
});

test('a 5 MB transcript is read in under 250 ms (median of 10 runs)', () => {
  const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(1000) });
  const lines = [...Array(5000).fill(filler), entry(65000)];
  const times = Array.from({ length: 10 }, () => run(lines, {}, { agent: true }).ms).sort((a, b) => a - b);
  const median = (times[4] + times[5]) / 2;
  console.log(`median ${median.toFixed(0)} ms`);
  assert.ok(median < 250, `median ${median} ms`);
});
