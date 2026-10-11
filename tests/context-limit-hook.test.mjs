import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'context-limit.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-hook-'));
const entry = (tokens) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } });

function run(lines, extra = {}) {
  const file = path.join(dir, `t${Math.random()}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const started = process.hrtime.bigint();
  const { stdout } = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: file, cwd: dir, tool_name: 'Read', ...extra }), encoding: 'utf8' });
  return { stdout, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

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
  assert.equal(run([entry(120000)], { tool_name: 'Write' }).stdout, '');
  assert.equal(run([entry(120000)], { tool_name: 'Agent' }).stdout, '');
});

test('a 5 MB transcript is read in under 250 ms (median of 10 runs)', () => {
  const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(1000) });
  const lines = [...Array(5000).fill(filler), entry(65000)];
  const times = Array.from({ length: 10 }, () => run(lines).ms).sort((a, b) => a - b);
  const median = (times[4] + times[5]) / 2;
  console.log(`median ${median.toFixed(0)} ms`);
  assert.ok(median < 250, `median ${median} ms`);
});
