import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'context-limit.mjs');
const HANDOFF = path.join(import.meta.dirname, '..', 'skills', 'save-session', 'scripts', 'handoff.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-'));
const entry = (tokens) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } });

// `agent` feeds the transcript as a subagent's own, keyed by its agent_id.
function run(lines, extra = {}, { agent = false } = {}) {
  const file = path.join(dir, `t${Math.random()}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const where = agent ? { agent_id: 'a1', agent_transcript_path: file } : { transcript_path: file };
  const started = process.hrtime.bigint();
  const { stdout } = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ ...where, cwd: dir, tool_name: 'Read', ...extra }), encoding: 'utf8' });
  return { stdout, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

const handoff = spawnSync(process.execPath, [HANDOFF, 'path', '--cwd', dir], { encoding: 'utf8' }).stdout.trim();

test('under the soft limit the hook prints nothing', () => {
  assert.equal(run([entry(10000)]).stdout, '');
});

test('over the soft limit it warns through additionalContext', () => {
  const output = JSON.parse(run([entry(65000)]).stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'PreToolUse');
  assert.match(output.additionalContext, /fresh subagent/);
});

test('over the hard limit it denies, except Write', () => {
  const output = JSON.parse(run([entry(120000)]).stdout).hookSpecificOutput;
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /hard limit/);
  assert.ok(handoff.endsWith('.md'), handoff);
  assert.ok(output.permissionDecisionReason.includes(handoff), output.permissionDecisionReason);
  assert.match(output.permissionDecisionReason, /one fresh general-purpose subagent/);
  assert.equal(run([entry(120000)], { tool_name: 'Write' }).stdout, '');
  assert.equal(run([entry(120000)], { tool_name: 'Agent' }).stdout, '');
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
  const times = Array.from({ length: 10 }, () => run(lines).ms).sort((a, b) => a - b);
  const median = (times[4] + times[5]) / 2;
  console.log(`median ${median.toFixed(0)} ms`);
  assert.ok(median < 250, `median ${median} ms`);
});
