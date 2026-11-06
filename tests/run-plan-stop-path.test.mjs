import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { approveGates, createRun, readState, runDir } from '../skills/build/scripts/run-state.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

const FAKE_CLAUDE = `
import fs from 'node:fs';
for await (const chunk of process.stdin);
fs.appendFileSync(process.env.FAKE_CALLS, 'session\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: Number(process.env.FAKE_COST ?? 0), result: 'done' }));
`;

const planText = (root, autonomy) => [
  '# Plan: stop path fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', `Autonomy: ${autonomy}`, '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `src/app.js` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup(autonomy) {
  const tools = await fixture();
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root, autonomy));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  const calls = path.join(tools, 'calls.txt');
  const home = await fixture();
  const id = '20260101T000000-aaaa';
  createRun(root, { id, plan: planPath });
  const dir = runDir(root, id);
  const start = async (flags, cost = 0) => {
    await fs.rm(calls, { force: true });
    const result = await run(RUN_PLAN, [planPath, '--root', root, '--claude', claude, '--session', 'task', ...flags], {
      cwd: root,
      env: { HOME: home, FAKE_CALLS: calls, FAKE_COST: String(cost), EXO_RUN: id, EXO_RUN_DIR: dir }
    });
    const sessions = (await fs.readFile(calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
    return { code: result.code, output: result.stdout + result.stderr, sessions, stop: readState(root, id).stop };
  };
  return { start, dir };
}

const stopShape = (kind) => ({ kind, task: 1, resumable: true });
const shapeOf = (stop) => ({ kind: stop?.kind, task: stop?.task, resumable: stop?.resumable });

test('the spend ceiling stop is written to state.json and a resume continues at the stopped task', async () => {
  const { start } = await setup('auto');
  const stopped = await start(['--max-iterations', '3', '--max-run-usd', '0.5'], 1);
  assert.equal(stopped.code, 4, stopped.output);
  assert.deepEqual(shapeOf(stopped.stop), stopShape('ceiling'), stopped.output);
  assert.match(stopped.stop.reason, /^budget:/);
  const resumed = await start(['--max-iterations', '3', '--max-run-usd', '50']);
  assert.ok(resumed.sessions >= 1, resumed.output);
  assert.match(resumed.output, /task 1\b/i, resumed.output);
});

test('the autonomy pause is written to state.json and a resume after approval continues at the stopped task', async () => {
  const { start, dir } = await setup('approve-each');
  const stopped = await start(['--max-iterations', '3']);
  assert.equal(stopped.code, 3, stopped.output);
  assert.equal(stopped.sessions, 0, stopped.output);
  assert.deepEqual(shapeOf(stopped.stop), stopShape('autonomy'), stopped.output);
  approveGates(dir);
  const resumed = await start(['--max-iterations', '3']);
  assert.ok(resumed.sessions >= 1, resumed.output);
  assert.match(resumed.output, /task 1\b/i, resumed.output);
});

test('the iteration cap stop is written to state.json and a resume continues at the stopped task', async () => {
  const { start } = await setup('auto');
  const stopped = await start(['--max-iterations', '1']);
  assert.equal(stopped.code, 1, stopped.output);
  assert.deepEqual(shapeOf(stopped.stop), stopShape('capped'), stopped.output);
  const resumed = await start(['--max-iterations', '3']);
  assert.ok(resumed.sessions >= 1, resumed.output);
  assert.match(resumed.output, /task 1\b/i, resumed.output);
});

test('every stop kind carries the same state.json keys', async () => {
  const kinds = [['auto', ['--max-iterations', '1']], ['approve-each', []]];
  const keys = [];
  for (const [autonomy, flags] of kinds) {
    const { start } = await setup(autonomy);
    const { stop } = await start(flags);
    keys.push(Object.keys(stop).sort().join(','));
  }
  assert.deepEqual(keys, ['kind,reason,resumable,task', 'kind,reason,resumable,task']);
});
