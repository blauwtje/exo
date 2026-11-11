import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runNoWait } from '../hooks/run-no-wait.mjs';
import { stallGuardInput } from '../hooks/run-stall-guard.mjs';
import { tempDir } from './harness.mjs';

function twoLines(text) {
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^Do instead: /);
}

test('a stop-hook block is one reason line and one next-step line', () => {
  const dir = tempDir('exo-fail-fast-');
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/3' };
  const input = { hook_event_name: 'Stop', session_id: 's1', last_assistant_message: 'Which one?' };
  twoLines(runNoWait(input, { env }).reason);
});

test('a stall-guard refusal is one reason line and one next-step line', () => {
  const input = { tool_name: 'Bash', tool_input: { command: 'echo land-task.mjs' } };
  twoLines(stallGuardInput(input).hookSpecificOutput.permissionDecisionReason);
});
