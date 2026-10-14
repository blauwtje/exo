import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { parsePlan } from '../lib/plan-tasks.mjs';
import { planPrompt, taskPrompt } from '../skills/build/scripts/run-prompts.mjs';
import { planText } from './run-plan-fixture.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'lib', 'stall-guard.mjs');

function guard(command, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, '--', command], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, EXO_STALL_MS: '', ...env },
  });
}

function withStallMs(value, body) {
  const saved = process.env.EXO_STALL_MS;
  process.env.EXO_STALL_MS = value;
  try {
    return body();
  } finally {
    if (saved === undefined) delete process.env.EXO_STALL_MS;
    else process.env.EXO_STALL_MS = saved;
  }
}

test('EXO_STALL_MS stops a silent command with exit 124 and the one-line message naming its seconds', () => {
  const started = Date.now();
  const result = guard('sleep 5', { EXO_STALL_MS: '1000' });
  assert.equal(result.status, 124);
  assert.match(result.stderr, /^exo: no output for 1 s, stopped\. Rerun with output streaming, e\.g\. 2>&1 \| tee <log>, and read the first error line\.\n$/);
  assert.ok(Date.now() - started < 4000);
});

test('a command that keeps printing is not stopped and its output and code pass through', () => {
  const result = guard('for i in 1 2 3; do echo tick$i; sleep 1; done; exit 3', { EXO_STALL_MS: '2000' });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /tick1\ntick2\ntick3\n/);
});

test('the task and plan prompts name the code-rule check command, one per task in the plan prompt', () => {
  const root = path.join(import.meta.dirname, '..');
  const plan = parsePlan(planText(root));
  const planPath = path.join(root, 'plan.md');
  const command = (number) => `--code-rules --plan ${planPath} --task ${number} --root ${root}`;
  const task = taskPrompt({ plan, planPath, number: 1, root, learnings: 'l.md', sandbox: false, runDir: '' });
  assert.ok(task.includes(command(1)));
  assert.match(task, /Code rules OK/);
  const together = planPrompt({ plan, planPath, numbers: [1, 2], root, sandbox: false });
  assert.ok(together.includes(command(1)));
  assert.ok(together.includes(command(2)));
  assert.match(together, /Code rules OK/);
});

test('the task and plan prompts of a sandboxed run name the stall limit the guard uses', () => {
  const root = path.join(import.meta.dirname, '..');
  const plan = parsePlan(planText(root));
  const shared = { plan, planPath: path.join(root, 'plan.md'), root };
  withStallMs('1000', () => {
    assert.match(taskPrompt({ ...shared, number: 1, learnings: 'l.md', sandbox: true, runDir: '' }), /silent for 1 seconds is stopped/);
    assert.match(planPrompt({ ...shared, numbers: [1, 2], sandbox: true }), /silent for 1 seconds is stopped/);
    assert.doesNotMatch(taskPrompt({ ...shared, number: 1, learnings: 'l.md', sandbox: false, runDir: '' }), /silent for/);
    assert.doesNotMatch(planPrompt({ ...shared, numbers: [1, 2], sandbox: false }), /silent for/);
  });
});
