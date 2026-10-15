// exo run --detach, exo status and exo run --resume against a temp repository.
// --dry-run keeps run-plan from starting sessions, so the final phase is `passed`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { acquireLock, createRun, keepRun, readState, updateRun } from '../skills/build/scripts/run-state.mjs';
import { STUB, setup as planSetup, taskSubject } from './run-plan-fixture.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));

const planText = (root) => [
  '# Plan: detach fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/detach', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
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
  assert.ok(result.stdout.includes(`watch: run \`node "${CLI}" wait ${line[1]}\` as one background Bash call`), result.stdout);
  const state = await finalState(context.root, line[1]);
  assert.equal(state.phase, 'passed');
  assert.equal(state.detach, true);
  assert.equal(state.exitCode, 0);
  assert.equal(state.log, path.join(context.root, '.exo', 'run', line[1], 'run.log'));
  await fs.access(path.join(context.root, '.exo', 'kept', line[1], 'run.log'));
  assert.match(result.stdout, /live log \S*live\.log/);
  const live = await fs.readFile(path.join(context.root, '.exo', 'run', 'live.log'), 'utf8');
  assert.match(live, new RegExp(`^=== \\d\\d:\\d\\d:\\d\\d run ${line[1]} p\\.md ===\\n`));
  assert.match(live, /^Provider: /m, 'a run-plan line reaches live.log');
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
  const land = (file, number) => ({ commits: [{ file, subject: taskSubject(number), trailers: [`Plan-task: plan/${number}`] }] });
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

const DEAD_PID = 2 ** 22 + 12345;

test('wait on a final run returns at once with the phase, the report path and exit 0 only on success', async () => {
  const context = await setup();
  createRun(context.root, { id: 'ok', plan: '/x/p.md', pid: DEAD_PID });
  updateRun(context.root, 'ok', { phase: 'passed' });
  keepRun(context.root, 'ok');
  const passed = await exo(context, ['wait', 'ok']);
  assert.equal(passed.code, 0, passed.stdout + passed.stderr);
  assert.ok(passed.stdout.includes('passed'), passed.stdout);
  assert.ok(passed.stdout.includes(path.join(context.root, '.exo', 'kept', 'ok', 'report.md')), passed.stdout);

  createRun(context.root, { id: 'bad', plan: '/x/p.md', pid: DEAD_PID });
  updateRun(context.root, 'bad', { phase: 'crashed' });
  const crashed = await exo(context, ['wait', 'bad']);
  assert.equal(crashed.code, 1, crashed.stdout + crashed.stderr);
  assert.ok(crashed.stdout.includes('crashed'), crashed.stdout);
  assert.ok(crashed.stdout.includes(path.join(context.root, '.exo', 'run', 'bad', 'report.md')), crashed.stdout);
});

test('wait returns once a running run turns final mid-poll', async () => {
  const context = await setup();
  createRun(context.root, { id: 'live', plan: '/x/p.md', pid: process.pid });
  updateRun(context.root, 'live', { phase: 'build' });
  const waiting = exo(context, ['wait', 'live']);
  await new Promise((resolve) => setTimeout(resolve, 500));
  updateRun(context.root, 'live', { phase: 'landed' });
  keepRun(context.root, 'live');
  const result = await waiting;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('landed'), result.stdout);
  assert.ok(result.stdout.includes(path.join(context.root, '.exo', 'kept', 'live', 'report.md')), result.stdout);
});

test('wait past its deadline exits non-zero with the phase and the command to keep waiting', async () => {
  const context = await setup();
  createRun(context.root, { id: 'slow', plan: '/x/p.md', pid: process.pid });
  updateRun(context.root, 'slow', { phase: 'verify' });
  const result = await run(CLI, ['wait', 'slow'], { cwd: context.root, env: { HOME: context.home, EXO_WAIT_MS: '200' } });
  assert.notEqual(result.code, 0);
  assert.ok(result.stdout.includes('verify'), result.stdout);
  assert.ok(result.stdout.includes(`node "${CLI}" wait slow`), result.stdout);
});

test('wait on a non-final run whose process is gone exits 1 with the resume command', async () => {
  const context = await setup();
  createRun(context.root, { id: 'gone', plan: '/x/p.md', pid: DEAD_PID });
  updateRun(context.root, 'gone', { phase: 'build' });
  const result = await exo(context, ['wait', 'gone']);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('exo run --resume gone'), result.stdout);
});

test('status with no runs refuses', async () => {
  const context = await setup();
  const result = await exo(context, ['status']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /no runs/);
});

const withSession = (context, session) => ({ HOME: context.home, CLAUDE_CODE_SESSION_ID: session });

async function keptStates(context) {
  const ids = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  return ids.map((id) => readKept(context.root, id));
}

test('a run records the launching session as its owner and omits it when none is set', async () => {
  const context = await setup();
  const args = ['run', 'docs/specs/p.md', '--dry-run', '--claude', context.stub];
  const first = await run(CLI, args, { cwd: context.root, env: withSession(context, 'session-one') });
  assert.equal(first.code, 0, first.stdout + first.stderr);
  assert.deepEqual((await keptStates(context)).map((state) => state.ownerSession), ['session-one']);
  await fs.rm(path.join(context.root, '.exo', 'kept'), { recursive: true });
  const bare = await run(CLI, args, { cwd: context.root, env: withSession(context, undefined) });
  assert.equal(bare.code, 0, bare.stdout + bare.stderr);
  const [unowned] = await keptStates(context);
  assert.equal('ownerSession' in unowned, false);
});

test('--resume under a second session rewrites the owner', async () => {
  const context = await setup();
  const plan = path.join(context.root, 'docs', 'specs', 'p.md');
  createRun(context.root, { id: 'dead', plan, flags: ['--dry-run', '--claude', context.stub], pid: 2 ** 22 + 12345, ownerSession: 'session-one' });
  updateRun(context.root, 'dead', { phase: 'build' });
  const resumed = await run(CLI, ['run', '--resume', 'dead'], { cwd: context.root, env: withSession(context, 'session-two') });
  assert.equal(resumed.code, 0, resumed.stdout + resumed.stderr);
  assert.equal(readRun(context.root, 'dead').ownerSession, 'session-two');
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
