import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { approveGates, createRun, readGates, runDir } from '../skills/build/scripts/run-state.mjs';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));

const FAKE_CLAUDE = `
import fs from 'node:fs';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
fs.appendFileSync(process.env.FAKE_CALLS, 'session\\n');
console.log(JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, total_cost_usd: 0, result: 'done' }));
`;

const planText = (root, autonomy, pause) => [
  '# Plan: autonomy fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, 'Branch: feat/fixture', 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', ...(autonomy === null ? [] : [`Autonomy: ${autonomy}`]), '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  `Depends on: none | Files: \`src/app.js\` | Data: a line${pause ? ' | Pause: yes' : ''} | Proof: node --version`, ''
].join('\n');

async function setup(autonomy, pause) {
  const tools = await fixture();
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  git(root, 'checkout', '-q', '-b', 'feat/fixture');
  await fs.mkdir(path.join(root, 'docs', 'plans'), { recursive: true });
  const planPath = path.join(root, 'docs', 'plans', 'fixture.md');
  await fs.writeFile(planPath, planText(root, autonomy, pause));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add the plan');
  const claude = path.join(tools, 'claude.mjs');
  await fs.writeFile(claude, FAKE_CLAUDE);
  const calls = path.join(tools, 'calls.txt');
  const home = await fixture();
  const id = '20260101T000000-aaaa';
  createRun(root, { id, plan: planPath });
  const dir = runDir(root, id);
  const start = async () => {
    await fs.rm(calls, { force: true });
    const result = await run(RUN_PLAN, [planPath, '--root', root, '--claude', claude, '--session', 'task', '--max-iterations', '2'], {
      cwd: root,
      env: { HOME: home, FAKE_CALLS: calls, EXO_RUN: id, EXO_RUN_DIR: dir }
    });
    const sessions = (await fs.readFile(calls, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
    return { result, output: result.stdout + result.stderr, sessions };
  };
  return { start, dir };
}

test('pause-flagged stops before a Pause: yes task with an open gate and no session', async () => {
  const { start, dir } = await setup('pause-flagged', true);
  const { result, output, sessions } = await start();
  assert.equal(result.code, 3, output);
  assert.equal(sessions, 0, output);
  assert.deepEqual(readGates(dir).map((gate) => [gate.status, gate.source]), [['open', 'autonomy']]);
});

test('approving the gate resumes the task and does not pause on it again', async () => {
  const { start, dir } = await setup('pause-flagged', true);
  await start();
  approveGates(dir);
  const { output, sessions } = await start();
  assert.ok(sessions >= 1, output);
  assert.doesNotMatch(output, /paused for approval/, output);
  assert.deepEqual(readGates(dir).map((gate) => gate.status), ['used']);
  const again = await start();
  assert.ok(again.sessions >= 1, again.output);
  assert.doesNotMatch(again.output, /paused for approval/, again.output);
});

test('approve-each stops before a task that carries no Pause field', async () => {
  const { start, dir } = await setup('approve-each', false);
  const { result, sessions } = await start();
  assert.equal(result.code, 3);
  assert.equal(sessions, 0);
  assert.equal(readGates(dir).length, 1);
});

for (const [autonomy, pause] of [[null, true], ['auto', true], ['pause-flagged', false]]) {
  test(`Autonomy ${autonomy ?? 'absent'} with Pause ${pause} does not stop before the task`, async () => {
    const { start, dir } = await setup(autonomy, pause);
    const { sessions } = await start();
    assert.ok(sessions >= 1);
    assert.deepEqual(readGates(dir), []);
  });
}

test('plan-check accepts the Autonomy values and Pause: yes and rejects others', () => {
  const root = '/tmp/exo-autonomy-check';
  for (const autonomy of ['auto', 'pause-flagged', 'approve-each']) {
    const report = planCheckReport(planText(root, autonomy, true), { root });
    assert.doesNotMatch(report.lines.join('\n'), /Autonomy|Pause/);
  }
  const badMode = planCheckReport(planText(root, 'sometimes', false), { root });
  assert.match(badMode.lines.join('\n'), /'Autonomy: sometimes' is not one of auto, pause-flagged, approve-each/);
  const badPause = planCheckReport(planText(root, 'auto', true).replace('Pause: yes', 'Pause: maybe'), { root });
  assert.match(badPause.lines.join('\n'), /'Pause: maybe' is not 'Pause: yes'/);
});
