// exo run --detach, exo status and exo run --resume against a temp repository.
// --dry-run keeps run-plan from starting sessions, so the final phase is `passed`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { acquireLock, createRun, readState, updateRun } from '../skills/build/scripts/run-state.mjs';
import { STUB, setup as planSetup } from './run-plan-fixture.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

const planText = (root) => [
  '# Plan: detach fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/detach', 'Land: local', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `a.txt` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup() {
  const root = await gitRepository({ 'README.md': 'fixture\n' });
  await fs.mkdir(path.join(root, 'docs', 'specs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'specs', 'p.md'), planText(root));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add plan');
  const stub = path.join(await fixture(), 'claude.mjs');
  await fs.writeFile(stub, '');
  return { root: await fs.realpath(root), stub, home: await fixture() };
}

const exo = (context, args) => run(CLI, args, { cwd: context.root, env: { HOME: context.home } });

function readKept(root, id) {
  try {
    return JSON.parse(readFileSync(path.join(root, '.exo', 'kept', id, 'state.json'), 'utf8'));
  } catch {
    return null;
  }
}

function readRun(root, id) {
  return readKept(root, id) ?? readState(root, id);
}

async function finalState(root, id, rounds = 100) {
  for (let round = 0; round < rounds; round++) {
    const kept = readKept(root, id);
    if (kept !== null) return kept;
    const state = readState(root, id);
    if (state && ['parked', 'stopped', 'crashed'].includes(state.phase)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${id} did not finish`);
}

test('--detach returns one line at once, the child finishes the run and frees the lock', async () => {
  const context = await setup();
  const result = await exo(context, ['run', 'docs/specs/p.md', '--detach', '--dry-run', '--claude', context.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const line = /^exo: run (\S+) started in the background \(pid (\d+)\)/.exec(result.stdout);
  assert.ok(line, result.stdout);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  const state = await finalState(context.root, line[1]);
  assert.equal(state.phase, 'passed');
  assert.equal(state.detach, true);
  assert.equal(state.exitCode, 0);
  assert.equal(state.log, path.join(context.root, '.exo', 'run', line[1], 'run.log'));
  await fs.access(path.join(context.root, '.exo', 'kept', line[1], 'run.log'));
  await assert.rejects(fs.access(path.join(context.root, '.exo', 'run', line[1])));
  await assert.rejects(fs.access(path.join(context.root, '.exo', 'run', 'lock')));
});

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a detached run with a fake claude outlives its parent and ends landed', async () => {
  // run-plan's fixture repository and session stub, each session held for 1 s:
  // the plan session lands its pinned task 1, a task session lands task 2, and
  // the tail of this inline-route plan is gate-only, with no session.
  const context = await planSetup();
  const root = await fs.realpath(context.root);
  const SESSION_MS = 1000;
  await fs.writeFile(path.join(context.tools, 'session.mjs'), STUB);
  await fs.writeFile(context.stub, `await new Promise((resolve) => setTimeout(resolve, ${SESSION_MS}));\nconst fs = await import('node:fs');\nfs.mkdirSync('.exo', { recursive: true });\nfs.writeFileSync('.exo/branch-review.md', 'CLEAN\\n\\nCount: fix=0\\n');\nawait import('./session.mjs');\n`);
  const land = (file, number) => ({ commits: [{ file, trailers: [`Plan-task: plan/${number}`] }] });
  const scenario = path.join(context.tools, 'scenario.json');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps: [land('a.txt', 1), land('b.txt', 2)] }));
  const env = { HOME: context.home, STUB_SCENARIO: scenario, STUB_RECORD: path.join(context.tools, 'calls.jsonl') };

  const started = Date.now();
  const result = await run(CLI, ['run', context.plan, '--detach', '--claude', context.stub], { cwd: root, env });
  const parentMs = Date.now() - started;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stdout);
  const line = /^exo: run (\S+) started in the background \(pid (\d+)\)/.exec(result.stdout);
  assert.ok(line, result.stdout);
  assert.ok(parentMs < SESSION_MS / 2, `the parent took ${parentMs} ms`);

  const [, id, printed] = line;
  const pid = Number(printed);
  const early = readState(root, id);
  assert.equal(early.pid, pid);
  assert.ok(isAlive(pid), 'the child outlives its parent');
  assert.ok(!['passed', 'landed', 'parked', 'stopped', 'refused', 'crashed'].includes(early.phase), early.phase);
  const state = await finalState(root, id, 600);
  assert.equal(state.phase, 'landed', await fs.readFile(path.join(root, '.exo', 'kept', id, 'run.log'), 'utf8'));
  assert.equal(state.exitCode, 0);
  assert.equal((await fs.readFile(env.STUB_RECORD, 'utf8')).trim().split('\n').length, 2, 'the plan session and one task session ran, no tail session');
  await assert.rejects(fs.access(path.join(root, '.exo', 'run', 'lock')));
  // The child writes the final phase just before it exits; give the exit a bounded moment.
  for (let round = 0; round < 50 && isAlive(pid); round++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(!isAlive(pid), 'the child is gone once the run is final');
});

test('a foreground run writes state with no log and releases the lock', async () => {
  const context = await setup();
  const result = await exo(context, ['run', 'docs/specs/p.md', '--dry-run', '--claude', context.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const dirs = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  assert.equal(dirs.length, 1);
  const state = readRun(context.root, dirs[0]);
  assert.equal(state.phase, 'passed');
  assert.equal(state.log, null);
  assert.equal(state.detach, false);
});

test('a live run holds the lock: a second run refuses with exit 2', async () => {
  const context = await setup();
  createRun(context.root, { id: 'held', plan: 'p', pid: process.pid });
  assert.deepEqual(acquireLock(context.root, 'held'), { ok: true });
  const result = await exo(context, ['run', 'docs/specs/p.md', '--detach', '--dry-run']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /refused: run held is still running/);
});

test('a refused foreground run ends in phase refused and frees the lock', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  const result = await exo(context, ['run', 'docs/specs/p.md', '--claude', context.stub]);
  assert.equal(result.code, 2);
  const [id] = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  assert.equal(readRun(context.root, id).phase, 'refused');
  await assert.rejects(fs.access(path.join(context.root, '.exo', 'run', 'lock')));
});

test('status names a non-final run whose process is gone and the resume command', async () => {
  const context = await setup();
  createRun(context.root, { id: 'dead', plan: '/x/p.md', pid: 2 ** 22 + 12345 });
  updateRun(context.root, 'dead', { phase: 'build' });
  createRun(context.root, { id: 'done', plan: '/x/q.md', pid: 1 });
  updateRun(context.root, 'done', { phase: 'passed' });
  const result = await exo(context, ['status']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^dead {2}build {2}p\.md .*exo run --resume dead$/m);
  assert.doesNotMatch(result.stdout, /^done .*resume/m);
});

test('status with no runs refuses', async () => {
  const context = await setup();
  const result = await exo(context, ['status']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /no runs/);
});

test('--resume continues a dead run with its stored plan and flags, and refuses missing, passed and live runs', async () => {
  const context = await setup();
  const plan = path.join(context.root, 'docs', 'specs', 'p.md');
  createRun(context.root, { id: 'dead', plan, flags: ['--dry-run', '--claude', context.stub], pid: 2 ** 22 + 12345 });
  updateRun(context.root, 'dead', { phase: 'build' });
  const result = await exo(context, ['run', '--resume', 'dead']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(readRun(context.root, 'dead').phase, 'passed');

  assert.match((await exo(context, ['run', '--resume', 'dead'])).stderr, /no run dead/);
  assert.match((await exo(context, ['run', '--resume', 'nope'])).stderr, /no run nope/);
  createRun(context.root, { id: 'live', plan, pid: process.pid });
  assert.match((await exo(context, ['run', '--resume', 'live'])).stderr, /still running/);
});
