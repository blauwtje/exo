// run-plan.mjs and EXO_RUN_DIR: the run state phase, the decisions file and
// the blocked and parked markers a session leaves for the runner.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './harness.mjs';
import { setup, PLUGIN_ROOT, runPlan, allowOf, sandboxOff, land } from './run-plan-fixture.mjs';

async function phaseAfter(steps, { set = true } = {}) {
  const context = await setup();
  const runRoot = await fs.realpath(await fixture());
  const id = '20260101T000000-abcd';
  const dir = path.join(runRoot, '.exo', 'run', id);
  const state = path.join(dir, 'state.json');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(state, JSON.stringify({ id, phase: 'starting' }));
  if (set) context.env = { EXO_RUN_DIR: dir };
  await runPlan(context, steps);
  return JSON.parse(await fs.readFile(state, 'utf8')).phase;
}

test('EXO_RUN_DIR: the run state ends stopped after a block and stays verify after the tail', async () => {
  assert.equal(await phaseAfter([{ result: 'Task 1: BLOCKED nothing to do' }]), 'stopped');
  assert.equal(await phaseAfter([land(1), land(2), { result: 'Verify done.' }]), 'verify');
});

async function runDirContext() {
  const context = await setup();
  const dir = path.join(await fs.realpath(await fixture()), '.exo', 'run', 'id');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ id: 'id', phase: 'starting' }));
  context.env = { EXO_RUN_DIR: dir };
  return { context, dir };
}

test('EXO_RUN_DIR: the prompt names decisions.md and run-decision, the rules admit it, and decisions are reported before the stop line', async () => {
  const { context, dir } = await runDirContext();
  await fs.writeFile(path.join(dir, 'decisions.md'), '- workspace: branch (ask)\n');
  await sandboxOff(context);
  const result = await runPlan(context, [{ result: 'Task 1: BLOCKED nothing' }]);
  const script = path.join(PLUGIN_ROOT, 'lib', 'run-decision.mjs');
  assert.match(result.calls[0].stdin, new RegExp(`Never ask the user.*${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${path.join(dir, 'decisions.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(allowOf(result.calls[0]).includes(`Bash(node ${script} *)`));
  assert.match(result.stdout, /^Decisions: 1, in .*decisions\.md$/m);
  const detail = (await fs.readFile(result.stdout.match(/^Details: (.+)$/m)[1], 'utf8')).split('\n').filter(Boolean);
  assert.deepEqual(detail.slice(-3, -1), ['Decisions:', '- workspace: branch (ask)']);
});

test('EXO_RUN_DIR: a stale blocked marker is removed at start and a fresh one naming the task stops the run as BLOCKED', async () => {
  const { context, dir } = await runDirContext();
  const marker = path.join(dir, 'blocked');
  await fs.writeFile(marker, 'Task 1: BLOCKED stale\n');
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nfs.writeFileSync(process.env.EXO_RUN_DIR + '/blocked', 'Task 1: BLOCKED which database?\\n');\nawait import(${JSON.stringify(context.stub)});\n`);
  context.stub = wrapper;
  const result = await runPlan(context, [{ result: 'Worked on it.' }, { result: 'Worked on it.' }]);
  assert.equal(result.stop, 'run-plan: stop: task 1 blocked: which database?; re-plan with exo:spec');
  assert.equal(result.calls.length, 2);
  assert.match(result.calls[1].stdin, /Plan repair of task 1/);
  await assert.rejects(fs.access(marker));
});

async function parkWrapper(context, task) {
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nfs.writeFileSync(process.env.EXO_RUN_DIR + '/parked', 'Task ${task}: PARKED git push origin main\\n');\nawait import(${JSON.stringify(context.stub)});\n`);
  context.stub = wrapper;
}

test('EXO_RUN_DIR: a stale parked marker is removed at start and a fresh one naming the task stops the run with exit 3', async () => {
  const { context, dir } = await runDirContext();
  const marker = path.join(dir, 'parked');
  await fs.writeFile(marker, 'Task 1: PARKED stale\n');
  await parkWrapper(context, 1);
  const result = await runPlan(context, [{ result: 'Worked on it.' }, { result: 'Worked on it.' }]);
  assert.equal(result.stop, 'run-plan: stop: parked: git push origin main');
  assert.equal(result.code, 3);
  assert.equal(result.calls.length, 1);
  await assert.rejects(fs.access(marker));
});

test('EXO_RUN_DIR: a parked marker naming the tail stops the run after a review session', async () => {
  const context = await setup({ risk: 'security boundary' });
  const dir = path.join(await fs.realpath(await fixture()), '.exo', 'run', 'id');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ id: 'id', phase: 'starting' }));
  context.env = { EXO_RUN_DIR: dir };
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nif (fs.readFileSync(0, 'utf8').includes('## Inputs')) fs.writeFileSync(process.env.EXO_RUN_DIR + '/parked', 'Task tail: PARKED git push origin main\\n');\nawait import(${JSON.stringify(context.stub)});\n`);
  context.stub = wrapper;
  const result = await runPlan(context, [land(1), land(2), { result: 'verdict=CLEAN defect=0 hazard=0 question=0 fix=0 report=x' }]);
  assert.equal(result.stop, 'run-plan: stop: parked: git push origin main');
  assert.equal(result.code, 3);
  await assert.rejects(fs.access(path.join(dir, 'parked')));
});

test('EXO_RUN_DIR: a stale parked marker never stops a run whose session writes none', async () => {
  const { context, dir } = await runDirContext();
  await fs.writeFile(path.join(dir, 'parked'), 'Task 1: PARKED stale\n');
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS');
  assert.equal(result.code, 0);
});

test('EXO_RUN_DIR: a stale blocked marker never stops a run whose session writes none', async () => {
  const { context, dir } = await runDirContext();
  await fs.writeFile(path.join(dir, 'blocked'), 'Task 1: BLOCKED stale\n');
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.equal(result.stop, 'run-plan: stop: done, 2/2 tasks landed, gate PASS');
  assert.doesNotMatch(result.stdout, /^Decisions/m);
});

test('EXO_RUN_DIR: state.json keeps the current task, the landed count and the stop reason', async () => {
  const { context, dir } = await runDirContext();
  await runPlan(context, [land(1), { result: 'Task 2: BLOCKED nothing to do' }]);
  const state = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.task.n, 2);
  assert.equal(state.landed, 1);
  assert.equal(state.total, 2);
  assert.equal(state.phase, 'stopped');
  assert.match(state.reason, /^task 2 blocked: nothing to do/);
});

test('EXO_RUN_DIR: a finished run records its done line and leaves the final phase to exo run', async () => {
  const { context, dir } = await runDirContext();
  await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  const state = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.landed, 2);
  assert.equal(state.phase, 'verify');
  assert.equal(state.reason, 'done, 2/2 tasks landed, gate PASS');
});

async function moveMain(root, file) {
  git(root, 'switch', '-q', 'main');
  await fs.writeFile(path.join(root, file), 'moved\n');
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', 'chore: move main');
  git(root, 'switch', '-q', 'feat/run');
}

test('a clean run tree rebases onto a local default branch that moved before the task starts', async () => {
  const context = await setup();
  await moveMain(context.root, 'moved.txt');
  const result = await runPlan(context, [land(1), land(2), { result: 'Verify done.' }]);
  assert.match(result.stdout, /rebased onto main/);
  assert.equal(git(context.root, 'merge-base', '--is-ancestor', 'main', 'HEAD') ?? '', '');
  assert.equal(git(context.root, 'log', '-1', '--format=%s', 'main'), 'chore: move main');
});

test('a rebase conflict is aborted, noted once, and the task runs on the old base', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'a.txt'), 'branch\n');
  git(context.root, 'add', 'a.txt');
  git(context.root, 'commit', '-q', '-m', 'chore: branch a');
  await moveMain(context.root, 'a.txt');
  const before = git(context.root, 'rev-parse', 'HEAD');
  const result = await runPlan(context, [{ result: 'Task 1: BLOCKED stop here' }]);
  assert.equal((result.stdout.match(/rebase onto main failed/g) ?? []).length, 1);
  assert.equal(result.calls.length, 2);
  assert.match(result.calls[1].stdin, /Plan repair of task 1/);
  assert.equal(git(context.root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(context.root, 'status', '--porcelain', '--untracked-files=no'), '');
});

test('EXO_RUN_DIR unset: the run state stays as it was', async () => {
  assert.equal(await phaseAfter([land(1), land(2), { result: 'Verify done.' }], { set: false }), 'starting');
});
