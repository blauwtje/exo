// The Read dispatcher runs the read guard and the delegate budget in one
// process: the guard's deny comes back through the dispatcher, a denied read
// is not counted by the budget, and a read nobody objects to prints nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dispatchRead } from '../hooks/dispatch-read.mjs';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-read.mjs', import.meta.url));
const step = (name, result) => ({ name, run: () => result });
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

async function dispatch(lines, extra = {}) {
  const directory = await fixture();
  const file = path.join(directory, 'big.ts');
  await fs.writeFile(file, Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join('\n'));
  const hookInput = { tool_name: 'Read', session_id: 's1', tool_input: { file_path: file }, ...extra };
  return run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify(hookInput),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
}

test('an unbounded read of a large file is denied by the read guard through the dispatcher', async () => {
  const outcome = await dispatch(600);
  assert.equal(outcome.code, 0, outcome.stderr);
  const decision = JSON.parse(outcome.stdout).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /read guard/);
});

test('a small file and unusable input produce no output', async () => {
  const small = await dispatch(10);
  assert.deepEqual([small.code, small.stdout], [0, '']);
  const directory = await fixture();
  const empty = await run(DISPATCHER, [], { cwd: directory, input: '', env: { CLAUDE_CONFIG_DIR: directory } });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
});

test('a denied read is not counted by the delegate budget, and an allowed read is', async () => {
  let counted = 0;
  const budget = { name: 'budget', run: () => { counted += 1; return null; } };
  const refused = await dispatchRead({}, [step('guard', deny('no'))], [budget]);
  assert.equal(refused.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(counted, 0);
  assert.equal(await dispatchRead({}, [step('guard', null)], [budget]), null);
  assert.equal(counted, 1);
});
