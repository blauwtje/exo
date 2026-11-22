import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { resolvePlanPath } from '../lib/checkout.mjs';
import { git, run, tempDir } from './harness.mjs';
import { nextTaskReport, reviewEffort } from '../skills/build/scripts/next-task.mjs';
import { landingCheckout, PLAN, SCRIPT as LAND_TASK } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;
const RELATIVE_PLAN = 'docs/plans/fixture.md';

async function mainAndWorktree() {
  const { root } = await landingCheckout();
  const worktree = path.join(root, '.worktrees', 'topic');
  git(root, 'worktree', 'add', '-q', '-b', 'topic', worktree);
  await fs.rm(path.join(worktree, RELATIVE_PLAN));
  return { root, worktree };
}

test('an absolute plan path is returned as given', () => {
  assert.equal(resolvePlanPath({ plan: '/nowhere/plan.md', root: undefined }), '/nowhere/plan.md');
});

test('a relative plan path that exists under the current directory resolves there', () => {
  const resolved = resolvePlanPath({ plan: 'package.json', root: tempDir() });
  assert.equal(resolved, path.resolve('package.json'));
});

test('a relative plan path found under the root resolves there', async () => {
  const { root } = await landingCheckout();
  assert.equal(resolvePlanPath({ plan: RELATIVE_PLAN, root }), path.join(root, RELATIVE_PLAN));
});

test('a relative plan path only in the main checkout resolves there from a worktree root', async () => {
  const { root, worktree } = await mainAndWorktree();
  assert.equal(resolvePlanPath({ plan: RELATIVE_PLAN, root: worktree }), path.join(root, RELATIVE_PLAN));
});

test('a missing relative plan path is returned unchanged', () => {
  assert.equal(resolvePlanPath({ plan: 'docs/specs/x.md', root: tempDir() }), 'docs/specs/x.md');
});

test('land-task from a worktree finds a relative plan that lives in the main checkout', async () => {
  const { worktree } = await mainAndWorktree();
  const result = await run(LAND_TASK, ['--plan', RELATIVE_PLAN, '--task', '1', '--root', worktree, '--check'], { cwd: worktree });
  assert.doesNotMatch(result.stderr, /no plan at/);
});

test('next-task from a worktree finds a relative plan that lives in the main checkout', async () => {
  const { worktree } = await mainAndWorktree();
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', worktree], { cwd: worktree });
  assert.doesNotMatch(result.stderr, /no plan at/);
  assert.equal(result.code, 0, result.stderr);
});

test('next-task prints the plan non-goals once with the next task', async () => {
  const { root } = await landingCheckout();
  const report = nextTaskReport({ planText: PLAN, planPath: path.join(root, RELATIVE_PLAN), root });
  assert.equal(report.split('Non-goals:\n- `src/other.js` stays as it is.').length, 2);
  assert.match(report, /Next: 1 feat\(app\): greet/);
});

test('next-task prints three lines and writes the task text to the Brief file', async () => {
  const { root } = await landingCheckout();
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 3, result.stdout);
  assert.match(lines[0], /^Landed: /);
  assert.match(lines[1], /^Next: 1 feat\(app\): greet$/);
  const briefPath = lines[2].replace(/^Brief: /, '');
  assert.notEqual(briefPath, lines[2]);
  assert.ok(path.isAbsolute(briefPath), briefPath);
  const brief = await fs.readFile(briefPath, 'utf8');
  assert.match(brief, /### Task 1: feat\(app\): greet/);
  assert.match(brief, /Non-goals:\n- `src\/other.js` stays as it is\./);
});

test('reviewEffort climbs at one, four and sixteen times the base', () => {
  assert.equal(reviewEffort(149, 150), 'low');
  assert.equal(reviewEffort(150, 150), 'medium');
  assert.equal(reviewEffort(599, 150), 'medium');
  assert.equal(reviewEffort(600, 150), 'high');
  assert.equal(reviewEffort(2399, 150), 'high');
  assert.equal(reviewEffort(2400, 150), 'xhigh');
});

async function featureBranchWithChange(lines) {
  const { root } = await landingCheckout();
  git(root, 'checkout', '-q', '-b', 'topic');
  await fs.writeFile(path.join(root, 'src/app.js'), Array.from({ length: lines }, (_, index) => `line ${index}\n`).join(''));
  git(root, 'commit', '-q', '-am', 'feat: change');
  return root;
}

test('next-task prints the review effort after Next: none', async () => {
  const root = await featureBranchWithChange(100);
  const plan = path.join(root, RELATIVE_PLAN);
  await fs.writeFile(plan, PLAN.replace(/### Task 4[\s\S]*$/, ''));
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines[1], 'Next: none');
  assert.match(lines[2], /^Review effort: low \(\d+ changed lines\)$/);
});

test('EXO_REVIEW_LINES moves the base of the review effort', async () => {
  const root = await featureBranchWithChange(100);
  await fs.writeFile(path.join(root, RELATIVE_PLAN), PLAN.replace(/### Task 4[\s\S]*$/, ''));
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root, env: { ...process.env, EXO_REVIEW_LINES: '10' } });
  assert.match(result.stdout, /^Review effort: high \(\d+ changed lines\)$/m);
});

test('next-task names the base unknown on the default branch', async () => {
  const { root } = await landingCheckout();
  const done = PLAN.replace(/### Task 4[\s\S]*$/, '');
  await fs.writeFile(path.join(root, RELATIVE_PLAN), done);
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Review effort: medium \(base unknown\)$/m);
});
