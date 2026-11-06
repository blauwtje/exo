import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { appendStep, approveGates, createRun, openGate, readState, runDir, updateRun } from '../skills/build/scripts/run-state.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));

const FAKE_CLAUDE = `
import fs from 'node:fs';
for await (const chunk of process.stdin);
fs.appendFileSync(process.env.FAKE_CALLS, 'session\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0, result: 'done' }));
`;

const planText = (root) => [
  '# Plan: resume fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `src/app.js` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup() {
  const tools = await fixture();
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  return { root, planPath, claude, calls: path.join(tools, 'calls.txt'), home: await fixture() };
}

const exo = (context, args) => run(CLI, ['run', context.planPath, '--claude', context.claude, '--session', 'task', '--max-iterations', '1', ...args], {
  cwd: context.root,
  env: { HOME: context.home, FAKE_CALLS: context.calls }
});

const output = (result) => result.stdout + result.stderr;

async function runIds(root) {
  const names = [];
  for (const folder of ['run', 'kept']) names.push(...await fs.readdir(path.join(root, '.exo', folder)).catch(() => []));
  return names.filter((name) => /^\d{8}T/.test(name)).sort();
}

function earlierRun(context, phase, id) {
  createRun(context.root, { id, plan: context.planPath, pid: 999999 });
  appendStep(context.root, id, { kind: 'task-start', task: 1 });
  updateRun(context.root, id, { phase, exitCode: 1 });
  return id;
}

test('a fresh exo run for the same plan adopts the earlier unfinished run', async () => {
  const context = await setup();
  const id = earlierRun(context, 'stopped', '20260101T000000-aaaa');
  const result = await exo(context, []);
  assert.match(output(result), new RegExp(`continuing run ${id}`), output(result));
  assert.deepEqual(await runIds(context.root), [id], output(result));
});

test('spent money is restored from state.json so the spend ceiling counts it', async () => {
  const context = await setup();
  const id = '20260101T000000-bbbb';
  createRun(context.root, { id, plan: context.planPath });
  updateRun(context.root, id, { spent: 1 });
  const result = await run(RUN_PLAN, [context.planPath, '--root', context.root, '--claude', context.claude, '--session', 'task', '--max-iterations', '3', '--max-run-usd', '0.5'], {
    cwd: context.root,
    env: { HOME: context.home, FAKE_CALLS: context.calls, EXO_RUN: id, EXO_RUN_DIR: runDir(context.root, id) }
  });
  const sessions = (await fs.readFile(context.calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
  assert.equal(result.code, 4, output(result));
  assert.equal(sessions, 0, output(result));
  assert.equal(readState(context.root, id).stop.kind, 'ceiling');
});

test('a plain exo run resumes a paused run once its pause is cleared and not before', async () => {
  const context = await setup();
  const id = earlierRun(context, 'parked', '20260101T000000-cccc');
  const dir = runDir(context.root, id);
  openGate(dir, { source: 'autonomy', action: 'start task 1 add a', reason: 'paused' });
  const blocked = await exo(context, []);
  assert.equal(blocked.code, 2, output(blocked));
  assert.match(blocked.stderr, /parked; use exo approve/);
  approveGates(dir);
  const resumed = await exo(context, []);
  assert.match(output(resumed), new RegExp(`continuing run ${id}`), output(resumed));
});
