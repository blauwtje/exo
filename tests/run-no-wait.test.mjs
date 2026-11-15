import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { roundCap } from '../lib/loop-budget.mjs';
import { runNoWait } from '../hooks/run-no-wait.mjs';
import { tempDir } from './harness.mjs';

function questionInput() {
  return { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', session_id: 's1', tool_input: { question: 'Which one do you want?' } };
}

test('a question is denied until the limit, then the blocked file is written', () => {
  const dir = tempDir('exo-no-wait-');
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/3' };
  for (let count = 1; count <= roundCap('wait') - 1; count += 1) {
    assert.equal(runNoWait(questionInput(), { env }).hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8')).s1, count);
    assert.ok(!fs.existsSync(path.join(dir, 'blocked')));
  }
  assert.equal(runNoWait(questionInput(), { env }).hookSpecificOutput.permissionDecision, 'deny');
  assert.match(fs.readFileSync(path.join(dir, 'blocked'), 'utf8'), /^Task 3: BLOCKED Which one do you want\?\n$/);
});
