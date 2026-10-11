// In an exo run a git-guard or destructive-guard deny, or a run-gate match
// (publish, release, tag push, deploy), opens a gate and parks the run; an
// approved gate's exact command passes once; a secret-guard deny stays plain;
// outside a run nothing changes.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveGates, readGates } from '../skills/build/scripts/run-state.mjs';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-bash.mjs', import.meta.url));

async function call(command, { env = {}, dir = null } = {}) {
  const directory = await fixture();
  const runDir = dir ?? path.join(directory, 'rundir');
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, EXO_RUN: '1', EXO_RUN_DIR: runDir, ...env }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  return { runDir, decision: outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput };
}

const parked = (runDir) => fs.readFile(path.join(runDir, 'parked'), 'utf8').catch(() => null);

test('a guard deny in a run opens a gate and writes the parked marker', async () => {
  for (const command of ['git push --force origin main', 'docker volume rm data']) {
    const { runDir, decision } = await call(command, { env: { EXO_RUN_TASK: 'plan/3' } });
    assert.equal(decision.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, /Task 3: BLOCKED parked/, command);
    assert.equal(await parked(runDir), `Task 3: PARKED ${command}\n`);
    assert.deepEqual(readGates(runDir).map((g) => [g.status, g.source, g.action]), [['open', 'task 3', command]]);
  }
});

test('run-gate matches publish, release, tag push and deploys', async () => {
  for (const command of ['npm publish', 'gh release create v1', 'git push origin v1.2.3 --tags', 'git push origin tag v1', 'vercel --prod', 'netlify deploy --prod', 'fly deploy']) {
    const { runDir, decision } = await call(command, { env: { EXO_RUN_TASK: '2' } });
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.equal(await parked(runDir), `Task 2: PARKED ${command}\n`, command);
  }
});

test('without a task the tail names the marker', async () => {
  const { runDir, decision } = await call('npm publish');
  assert.match(decision.permissionDecisionReason, /Task tail: BLOCKED parked/);
  assert.equal(await parked(runDir), 'Task tail: PARKED npm publish\n');
  assert.equal(readGates(runDir)[0].source, 'task tail');
});

test('a secret-guard deny stays plain', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'), { recursive: true });
  await fs.writeFile(path.join(directory, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Read(./secret.txt)'] } }));
  const runDir = path.join(directory, 'rundir');
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'cat secret.txt' } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, EXO_RUN: '1', EXO_RUN_DIR: runDir }
  });
  const decision = JSON.parse(outcome.stdout).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /secret-guard/);
  assert.equal(await parked(runDir), null);
  assert.deepEqual(readGates(runDir), []);
});

test('an approved gate passes its exact command once, then parks again', async () => {
  const command = 'git push --force origin main';
  const env = { EXO_RUN_TASK: '1' };
  const { runDir } = await call(command, { env });
  assert.equal(approveGates(runDir), 1);
  const other = await call('git push --force origin other', { env, dir: runDir });
  assert.equal(other.decision.permissionDecision, 'deny');
  const first = await call(command, { env, dir: runDir });
  assert.equal(first.decision?.permissionDecision, 'allow');
  assert.equal(readGates(runDir).find((g) => g.action === command).status, 'used');
  const second = await call(command, { env, dir: runDir });
  assert.equal(second.decision.permissionDecision, 'deny');
});

test('outside a run a guard deny is plain and nothing is written', async () => {
  const { runDir, decision } = await call('git push --force origin main', { env: { EXO_RUN: '', EXO_RUN_DIR: '' } });
  assert.match(decision.permissionDecisionReason, /git-guard/);
  assert.doesNotMatch(decision.permissionDecisionReason, /parked/);
  assert.equal(await parked(runDir), null);
  assert.equal((await call('npm publish', { env: { EXO_RUN: '', EXO_RUN_DIR: '' } })).decision, null);
});
