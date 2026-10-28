// next-task.mjs prints each dispatchable task's filled implementer prompt and
// Since: epoch; with --open-slots it opens a Wave's slot worktrees and the
// baseline itself, discards the wave when a slot fails, and prints the exact
// wait and land commands. land-task --next swaps its Then: line for that report.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeBuildProgress } from '../lib/build-progress.mjs';
import { refusalHandler } from '../lib/refusal-handlers.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { refreshProgress } from '../skills/build/scripts/next-task.mjs';
import { commitFiles, git, planFixture, run } from './harness.mjs';
import { editApp, landingCheckout, PLAN, SCRIPT as LAND_TASK, taskSection } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;

const wavePlan = (worktreeSetup = 'none') => planFixture({ worktreeSetup, parallel: 'every task.', tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'Left', files: ['- Create: `src/left.js`'], subject: 'feat(app): left' }),
  taskSection({ number: 3, title: 'Right', files: ['- Create: `src/right.js`'], subject: 'feat(app): right' }),
  taskSection({ number: 4, title: 'Both', dependsOn: 'Task 2', files: ['- Create: `src/both.js`'], subject: 'feat(app): both' })
] });

// A checkout with Task 1 landed, so the next report names a Wave.
async function afterTaskOne(worktreeSetup) {
  const { root, planPath } = await landingCheckout();
  excludeScratch(root);
  const plan = wavePlan(worktreeSetup);
  await commitFiles(root, { 'docs/plans/fixture.md': plan }, 'chore: plan');
  await editApp(root);
  landTask({ planPath, planText: plan, number: 1, root });
  const next = (...extra) => run(NEXT_TASK, ['--plan', planPath, '--root', root, ...extra], { cwd: root });
  return { root, planPath, plan, next };
}

const worktrees = (root) => git(root, 'worktree', 'list');

test('a Next: task prints Since: and its implementer prompt filled', async () => {
  const { root, planPath } = await landingCheckout();
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Next: Task 1$/m);
  assert.match(result.stdout, /^Dispatch: exo:build-task$/m);
  assert.match(result.stdout, /^Since: \d{10}$/m);
  assert.match(result.stdout, /^Wait: node ".+wait-report\.mjs" --since \d{10} --report "\S+\/\.exo\/implementer-1\.md" --stamp "\S+\/\.exo\/checked-1"   \(tool timeout 600000; exit 2 reruns, at most three runs/m);
  const brief = result.stdout.match(/^Brief: (.+)$/m)[1];
  assert.match(result.stdout, new RegExp(`^Prompt:\\nTask 1 of ${planPath}, branch feat/fixture, checkout ${root}\\.\\nRead your brief at ${brief}\\.\\nReport to: ${root}/\\.exo/implementer-1\\.md\\nReturn: one line$`, 'm'));
});

// The plan names its only content input by absolute path, outside the checkout,
// under Assumptions, which names none of the task's Files.
async function planWithInput(input, region = 'greet') {
  const plan = PLAN.replace('(`greet`)', `(\`${region}\`)`).replace('## Tasks', `## Assumptions\n\n- assume: the notes at \`${input}\` are the only content input.\n\n## Tasks`);
  const { root, planPath } = await landingCheckout();
  await commitFiles(root, { 'docs/plans/fixture.md': plan }, 'chore: plan');
  return run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
}

test('an input the plan names outside the checkout reaches the brief', async () => {
  const input = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-input-')), 'notes.md');
  await fs.writeFile(input, 'notes\n');
  const result = await planWithInput(input);
  assert.match(result.stdout, /^Prompt:$/m);
  const brief = await fs.readFile(result.stdout.match(/^Brief: (.+)$/m)[1], 'utf8');
  assert.ok(brief.includes(`the notes at \`${input}\``), brief);
});

test('only a brief carrying an input path tells the builder to block on an unreadable one', async () => {
  const blockLine = 'Inputs: read each absolute path above before building; one unreadable → end on `Task 1: BLOCKED input unreadable: <path>`, never write its content from memory.';
  const input = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-input-'));
  const withInput = await planWithInput(input);
  assert.ok((await fs.readFile(withInput.stdout.match(/^Brief: (.+)$/m)[1], 'utf8')).split('\n').includes(blockLine));
  const { root, planPath } = await landingCheckout();
  const without = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  assert.doesNotMatch(await fs.readFile(without.stdout.match(/^Brief: (.+)$/m)[1], 'utf8'), /^Inputs:/m);
});

test('a backticked route the plan names is no input and does not block the task', async () => {
  const result = await planWithInput('/api/:id/items');
  assert.match(result.stdout, /^Prompt:$/m);
  assert.doesNotMatch(result.stdout, /PLAN DRIFT/);
  assert.doesNotMatch(await fs.readFile(result.stdout.match(/^Brief: (.+)$/m)[1], 'utf8'), /^Inputs:/m);
});

test('absolute paths that exist only on another machine are no input and do not block the task', async () => {
  const result = await planWithInput('/var/backups/example-app` and `/srv/example-app/data');
  assert.match(result.stdout, /^Prompt:$/m);
  assert.doesNotMatch(result.stdout, /PLAN DRIFT/);
  assert.doesNotMatch(await fs.readFile(result.stdout.match(/^Brief: (.+)$/m)[1], 'utf8'), /^Inputs:/m);
});

test('an unreachable input the plan names stops the task before dispatch', async () => {
  const input = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-input-')), 'missing.md');
  const result = await planWithInput(input);
  assert.ok(result.stdout.split('\n').includes(`PLAN DRIFT: Task 1: input \`${input}\` is unreachable`), result.stdout);
  assert.doesNotMatch(result.stdout, /^(?:Prompt|Dispatch):/m);
  const lines = result.stdout.split('\n');
  assert.equal(lines[lines.findIndex((line) => line.startsWith('PLAN DRIFT: ')) + 1], refusalHandler('input unreachable'));
});

test('a region drift beside an unreachable input still stops the task as an unreachable input', async () => {
  const input = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-input-')), 'missing.md');
  const result = await planWithInput(input, 'farewell');
  const lines = result.stdout.split('\n');
  assert.ok(lines.includes(`PLAN DRIFT: Task 1: input \`${input}\` is unreachable`), result.stdout);
  assert.ok(lines.includes('PLAN DRIFT: Task 1: region `farewell` is missing from `src/app.js`'), result.stdout);
  assert.equal(lines[lines.findLastIndex((line) => line.startsWith('PLAN DRIFT: ')) + 1], refusalHandler('input unreachable'));
});

test('a region drift with no unreachable input keeps the plan drift handler', async () => {
  const input = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-input-'));
  const result = await planWithInput(input, 'farewell');
  const lines = result.stdout.split('\n');
  assert.ok(lines.includes('PLAN DRIFT: Task 1: region `farewell` is missing from `src/app.js`'), result.stdout);
  assert.ok(!lines.some((line) => line.includes('is unreachable')), result.stdout);
  assert.equal(lines[lines.findLastIndex((line) => line.startsWith('PLAN DRIFT: ')) + 1], refusalHandler('plan drift'));
});

test('a design task prints no prompt', async () => {
  const plan = planFixture({ tasks: [taskSection({ number: 1, title: 'Look', design: true, files: ['- Create: `src/look.js`'], subject: 'feat(app): look' })] });
  const { root, planPath } = await landingCheckout();
  await commitFiles(root, { 'docs/plans/fixture.md': plan }, 'chore: plan');
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Next: Task 1$/m);
  assert.doesNotMatch(result.stdout, /^(?:Prompt|Since|Dispatch):/m);
});

test('a Wave without --open-slots opens nothing and prints no prompt', async () => {
  const { root, next } = await afterTaskOne('none');
  const result = await next();
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  assert.doesNotMatch(result.stdout, /^(?:Prompt|Slot|Wait):/m);
  assert.equal(worktrees(root).split('\n').length, 1);
});

test('--open-slots on a Wave writes the baseline, opens each slot and prints the wait and land commands', async () => {
  const { root, planPath, next } = await afterTaskOne('none');
  await fs.writeFile(path.join(root, 'preexisting.txt'), 'x\n');
  const result = await next('--open-slots');
  assert.equal(result.code, 0, result.stderr);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  assert.match(result.stdout, new RegExp(`^Base: ${head}$`, 'm'));
  assert.equal(await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8'), '?? preexisting.txt\n');
  for (const number of [2, 3]) {
    const slot = `${root}-task-${number}`;
    assert.match(worktrees(root), new RegExp(`${slot} +[0-9a-f]+ \\(detached HEAD\\)`));
    assert.equal(git(slot, 'rev-parse', 'HEAD'), head);
    assert.ok((await fs.stat(path.join(slot, '.exo'))).isDirectory());
    assert.match(result.stdout, new RegExp(`^Slot: ${slot}$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Task ${number} of ${planPath}, branch feat/fixture, checkout ${slot}\\.$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Report to: ${slot}/\\.exo/implementer-${number}\\.md$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Land ${number}: node ".+land-slot\\.mjs" --plan "${planPath}" --task ${number} --root "${root}" --slot "${slot}" --base ${head} --baseline "${root}/\\.exo/baseline\\.txt" --in-flight ${5 - number}$`, 'm'));
  }
  assert.match(result.stdout, /^Dispatch all in one message, run_in_background: true; Since: \d{10}$/m);
  assert.match(result.stdout, /^Wait: node ".+wait-report\.mjs" --any --since \d{10} --report ".+-task-2\/\.exo\/implementer-2\.md" --stamp ".+-task-2\/\.exo\/checked-2" --since \d{10} --report ".+-task-3\/\.exo\/implementer-3\.md" --stamp ".+-task-3\/\.exo\/checked-3"/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), '?? preexisting.txt');
});

test('a failed worktree add discards the wave and the first task builds alone in the run checkout', async () => {
  const { root, next } = await afterTaskOne('none');
  await fs.mkdir(`${root}-task-3`);
  await fs.writeFile(path.join(`${root}-task-3`, 'in-the-way.txt'), 'x\n');
  const result = await next('--open-slots');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Wave discarded: git worktree add .+-task-3 failed/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.doesNotMatch(result.stdout, /^(?:Wave|Slot):/m);
  assert.match(result.stdout, /^Dispatch: exo:build-task$/m);
  assert.match(result.stdout, new RegExp(`checkout ${root}\\.$`, 'm'));
  assert.doesNotMatch(worktrees(root), /-task-2/);
  await assert.rejects(fs.stat(`${root}-task-2`));
});

test('a failing Worktree setup discards the wave', async () => {
  const { root, next } = await afterTaskOne('exit 3');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave discarded: Worktree setup failed in .+-task-2/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.equal(worktrees(root).split('\n').length, 1);
});

test('the Worktree setup command runs inside each slot', async () => {
  const { root, next } = await afterTaskOne('touch setup-ran');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  for (const number of [2, 3]) assert.ok((await fs.stat(path.join(`${root}-task-${number}`, 'setup-ran'))).isFile());
});

test('a gitignored relative plan input is copied into each slot', async () => {
  const { root, plan, planPath, next } = await afterTaskOne('none');
  const withInput = plan.replace('## Tasks', '## Assumptions\n\n- assume: the data in `data/notes.md` is the only content input.\n\n## Tasks');
  await fs.writeFile(planPath, withInput);
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data', 'notes.md'), 'secret\n');
  await fs.appendFile(path.join(root, '.git', 'info', 'exclude'), 'data/\n');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  for (const number of [2, 3]) assert.equal(await fs.readFile(path.join(`${root}-task-${number}`, 'data', 'notes.md'), 'utf8'), 'secret\n');
});

test('a gitignored folder or .env input is not copied into a slot', async () => {
  const { root, plan, planPath, next } = await afterTaskOne('none');
  const withInput = plan.replace('## Tasks', '## Assumptions\n\n- assume: the data in `data/` and `config/.env.local` are the only inputs.\n\n## Tasks');
  await fs.writeFile(planPath, withInput);
  await fs.mkdir(path.join(root, 'data'));
  await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'data', 'notes.md'), 'secret\n');
  await fs.writeFile(path.join(root, 'config', '.env.local'), 'TOKEN=1\n');
  await fs.appendFile(path.join(root, '.git', 'info', 'exclude'), 'data/\nconfig/\n');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  for (const number of [2, 3]) {
    await assert.rejects(fs.stat(path.join(`${root}-task-${number}`, 'data')));
    await assert.rejects(fs.stat(path.join(`${root}-task-${number}`, 'config', '.env.local')));
  }
});

test('a gitignored relative input missing in the run root is left alone', async () => {
  const { root, plan, planPath, next } = await afterTaskOne('none');
  await fs.writeFile(planPath, plan.replace('## Tasks', '## Assumptions\n\n- assume: the data in `data/gone.md` is the only input.\n\n## Tasks'));
  await fs.appendFile(path.join(root, '.git', 'info', 'exclude'), 'data/\n');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  await assert.rejects(fs.stat(path.join(`${root}-task-2`, 'data')));
});

test('a refill opens its slot with its own base, keeps the baseline and prints a wait over every running slot', async () => {
  const { root, next } = await afterTaskOne('none');
  await next('--open-slots');
  const baseline = await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8');
  await fs.writeFile(path.join(root, 'src', 'left.js'), 'export const left = 1;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'feat(app): left', '-m', 'Plan-task: fixture/2');
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await next('--open-slots', '--in-flight', '3');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Start: Task 4$/m);
  assert.match(result.stdout, new RegExp(`^Land 4: .+--task 4 --root "${root}" --slot "${root}-task-4" --base ${head} .+--in-flight 3$`, 'm'));
  assert.match(result.stdout, /^Wait: .+checked-3" .+checked-4"/m);
  assert.equal(await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8'), baseline);
  assert.match(worktrees(root), new RegExp(`${root}-task-4 `));
});

test('a refill with nothing to start still prints the wait over the running slots', async () => {
  const { next } = await afterTaskOne('none');
  await next('--open-slots');
  const result = await next('--open-slots', '--in-flight', '2,3');
  assert.match(result.stdout, /^Start: none$/m);
  assert.match(result.stdout, /^Wait: .+checked-2" .+checked-3"/m);
});

test('land-task --next replaces the Then: line with next-task\'s report', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const result = await run(LAND_TASK, ['--plan', planPath, '--task', '1', '--root', root, '--next'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
  assert.doesNotMatch(result.stdout, /^Then:/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.match(result.stdout, /^Prompt:\nTask 2 of /m);
});

test('land-task without --next keeps the Then: line', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const result = await run(LAND_TASK, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.match(result.stdout, /^Then: node ".+next-task\.mjs" --block/m);
  assert.doesNotMatch(result.stdout, /^Prompt:/m);
});

const progressFile = (cache, id) => path.join(cache, 'exo', 'build', `${id}.json`);

async function seedProgress(cache, { plan, root, id = 'sess-1' }) {
  writeBuildProgress({ sessionId: id, plan, checkout: root, landed: 0, total: 4 }, { env: { XDG_CACHE_HOME: cache }, now: 1000 });
  return progressFile(cache, id);
}

const readProgress = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

test('next-task refreshes the session record with landed counted on the checkout', async () => {
  const { root, planPath } = await landingCheckout();
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const file = await seedProgress(cache, { plan: planPath, root });
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root, env: { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' } });
  assert.equal(result.code, 0, result.stderr);
  const record = await readProgress(file);
  assert.equal(record.landed, 1);
  assert.equal(record.total, 4);
  assert.ok(record.updatedAt > 1000);
});

test('next-task leaves the record alone without a session id, under EXO_RUN_TASK, for another plan or with no record', async () => {
  const { root, planPath } = await landingCheckout();
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const file = await seedProgress(cache, { plan: planPath, root });
  const other = await seedProgress(cache, { plan: '/elsewhere/other.md', root, id: 'sess-2' });
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  const args = ['--plan', planPath, '--root', root];
  const quiet = { CLAUDE_CODE_SESSION_ID: '', XDG_CACHE_HOME: cache };
  await run(NEXT_TASK, args, { cwd: root, env: quiet });
  await run(NEXT_TASK, args, { cwd: root, env: { ...quiet, CLAUDE_CODE_SESSION_ID: 'sess-1', EXO_RUN_TASK: 'fixture/2' } });
  const mismatched = await run(NEXT_TASK, args, { cwd: root, env: { ...quiet, CLAUDE_CODE_SESSION_ID: 'sess-2' } });
  const missing = await run(NEXT_TASK, args, { cwd: root, env: { ...quiet, CLAUDE_CODE_SESSION_ID: 'sess-3' } });
  assert.equal(mismatched.code, 0, mismatched.stderr);
  assert.equal(missing.code, 0, missing.stderr);
  assert.equal((await readProgress(file)).landed, 0);
  assert.equal((await readProgress(other)).landed, 0);
  await assert.rejects(fs.access(progressFile(cache, 'sess-3')));
});

test('next-task deletes the record once every task has landed', async () => {
  const { root, planPath } = await landingCheckout();
  const plan = planFixture({ tasks: [taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })] });
  await fs.writeFile(planPath, plan);
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const file = await seedProgress(cache, { plan: planPath, root });
  git(root, 'commit', '--allow-empty', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root, env: { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' } });
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(fs.access(file));
});

test('next-task refreshes a record whose plan was given as a relative --plan', async () => {
  const { root, planPath } = await landingCheckout();
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const realPlan = await fs.realpath(planPath);
  const realRoot = await fs.realpath(root);
  const file = await seedProgress(cache, { plan: realPlan, root });
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  const result = await run(NEXT_TASK, ['--plan', path.relative(realRoot, realPlan), '--root', root], { cwd: realRoot, env: { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await readProgress(file)).landed, 1);
});

function setEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('refreshProgress counts landed on the record checkout, not the caller root', async () => {
  const { root, planPath } = await landingCheckout();
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const file = await seedProgress(cache, { plan: planPath, root });
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-elsewhere-'));
  const saved = { cache: process.env.XDG_CACHE_HOME, id: process.env.CLAUDE_CODE_SESSION_ID, task: process.env.EXO_RUN_TASK };
  Object.assign(process.env, { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' });
  delete process.env.EXO_RUN_TASK;
  try {
    refreshProgress({ planPath, planText: PLAN, root: elsewhere });
  } finally {
    for (const [name, value] of [['XDG_CACHE_HOME', saved.cache], ['CLAUDE_CODE_SESSION_ID', saved.id], ['EXO_RUN_TASK', saved.task]]) setEnv(name, value);
  }
  assert.equal((await readProgress(file)).landed, 1);
});

test('next-task keeps the record of another plan even when this plan is fully landed', async () => {
  const { root, planPath } = await landingCheckout();
  const plan = planFixture({ tasks: [taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })] });
  await fs.writeFile(planPath, plan);
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const file = await seedProgress(cache, { plan: '/elsewhere/other.md', root });
  git(root, 'commit', '--allow-empty', '-q', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root, env: { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await readProgress(file)).plan, '/elsewhere/other.md');
});
