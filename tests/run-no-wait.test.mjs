import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { roundCap } from '../lib/loop-budget.mjs';
import { runNoWait } from '../hooks/run-no-wait.mjs';
import { tempDir } from './harness.mjs';

function stopInput(session = 's1') {
  return { hook_event_name: 'Stop', session_id: session, last_assistant_message: 'Which one do you want?' };
}

test('a stop without a status line is blocked until the limit, then the blocked file is written', () => {
  const dir = tempDir('exo-no-wait-');
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/3' };
  for (let count = 1; count <= roundCap('wait') - 1; count += 1) {
    assert.equal(runNoWait(stopInput(), { env }).decision, 'block');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8')).s1, count);
    assert.ok(!fs.existsSync(path.join(dir, 'blocked')));
  }
  assert.equal(runNoWait(stopInput(), { env }), null);
  assert.match(fs.readFileSync(path.join(dir, 'blocked'), 'utf8'), /^Task 3: BLOCKED Which one do you want\?\n$/);
});

test('a stop with the task status line is allowed and counts nothing', () => {
  const dir = tempDir('exo-no-wait-');
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir, EXO_RUN_TASK: 'plan/3' };
  const input = { ...stopInput(), last_assistant_message: 'Task 3: GREEN done' };
  assert.equal(runNoWait(input, { env }), null);
  assert.ok(!fs.existsSync(path.join(dir, 'blocks.json')));
});
