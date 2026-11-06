import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { agentHook } from '../hooks/agent-effort.mjs';
import { dispatchBytesPerToken } from '../lib/context-limits.mjs';
import { tempDir } from './harness.mjs';

delete process.env.EXO_PROVIDER;

const refusal = (prompt, cwd) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd, tool_input: { subagent_type: 'general-purpose', description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecisionReason;

function bigFile(dir, tokens) {
  const lines = Math.ceil((tokens * dispatchBytesPerToken()) / 40);
  fs.writeFileSync(path.join(dir, 'big.md'), `${'a line of prose for the estimate\n'.repeat(lines)}`);
}

test('a brief with no Reads line is refused with the exact Reads line to add, built from the files it names', () => {
  const dir = tempDir('brief-denials-');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'small');
  const reason = refusal('Edit notes.md and fix the heading.\nResult: .exo/r.md', dir);
  assert.match(reason, /lacks a `Reads:` line\. Do instead: add `Reads: notes\.md`/);
});

test('a brief that names no file is told to write Reads: none', () => {
  const dir = tempDir('brief-denials-');
  assert.match(refusal('Say hello.\nResult: .exo/r.md', dir), /Do instead: add `Reads: none`/);
});

test('a 124k-token whole-file read is refused with the lines range that fits the budget and the grep form', () => {
  const dir = tempDir('brief-denials-');
  bigFile(dir, 124000);
  const reason = refusal('Reads: big.md\nResult: .exo/r.md', dir);
  const range = /`Reads: big\.md lines 1-(\d+)` \(about (\d+) tokens\)/.exec(reason);
  assert.ok(range, reason);
  assert.ok(Number(range[2]) <= 30000, reason);
  assert.match(reason, /`grep -n <term> big\.md`.*`Reads: big\.md lines <a>-<b>`/);
  const fixed = refusal(`Reads: big.md lines 1-${range[1]}\nResult: .exo/r.md`, dir);
  assert.equal(fixed, undefined);
});
