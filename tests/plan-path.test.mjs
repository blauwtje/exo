import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { resolvePlanPath } from '../lib/checkout.mjs';
import { scratchPath } from '../lib/scratch-path.mjs';
import { REPOSITORY_ROOT, git, run, tempDir } from './harness.mjs';
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

test('next-task prints the plan Facts with the next task', async () => {
  const { root } = await landingCheckout();
  const planText = PLAN.replace('## Non-goals', '## Facts\n- `src/app.js:1` exports `greet`.\n\n## Non-goals');
  const report = nextTaskReport({ planText, planPath: path.join(root, RELATIVE_PLAN), root });
  assert.match(report, /Facts:\n- `src\/app\.js:1` exports `greet`\./);
});

test('next-task prints the brief, report and dispatch lines and writes the task text to the Brief file', async () => {
  const { root } = await landingCheckout();
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 13, result.stdout);
  assert.match(lines[0], /^Landed: /);
  assert.match(lines[1], /^Next: 1 feat\(app\): greet$/);
  assert.match(lines[2], /^Route: (this session|builder|builder chain \d+)$/);
  const briefPath = lines[3].replace(/^Brief: /, '');
  assert.notEqual(briefPath, lines[3]);
  assert.ok(path.isAbsolute(briefPath), briefPath);
  assert.equal(lines[4], `Report: ${scratchPath(root, 'implementer-1.md')}`);
  assert.equal(lines[5], 'Dispatch:');
  assert.deepEqual(lines.slice(6), [
    `  Plan: ${path.join(root, RELATIVE_PLAN)}`,
    `  Checkout: ${root}`,
    '  Task: 1',
    `  Read first: ${briefPath}`,
    `  Report path: ${scratchPath(root, 'implementer-1.md')}`,
    `  Prompt: ${path.join(REPOSITORY_ROOT, 'skills/build/references/run-task-prompt.md')}`,
    `  Land with: --plan ${path.join(root, RELATIVE_PLAN)} --task 1 --root ${root}`
  ]);
  const brief = await fs.readFile(briefPath, 'utf8');
  assert.match(brief, /### Task 1: feat\(app\): greet/);
  assert.match(brief, /Non-goals:\n- `src\/other.js` stays as it is\./);
});

test('reviewEffort climbs at one and four times the base and stops at high', () => {
  assert.equal(reviewEffort(149, 150), 'medium');
  assert.equal(reviewEffort(150, 150), 'medium');
  assert.equal(reviewEffort(599, 150), 'medium');
  assert.equal(reviewEffort(600, 150), 'high');
  assert.equal(reviewEffort(2399, 150), 'high');
  assert.equal(reviewEffort(2400, 150), 'high');
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
  assert.match(lines[2], /^Review effort: medium \(\d+ changed lines\)$/);
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

async function finishedPlanRun(plan) {
  const { root } = await landingCheckout();
  await fs.writeFile(path.join(root, RELATIVE_PLAN), plan.replace(/### Task 4[\s\S]*$/, ''));
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  return run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
}

test('next-task prints the Review Focus bullets after the review effort with Next: none', async () => {
  const withFocus = PLAN.replace('## Tasks', '## Review Focus\n- A list saved before this change must still load.\n- The empty input is handled.\n\n## Tasks');
  const result = await finishedPlanRun(withFocus);
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.match(lines[2], /^Review effort: /);
  assert.deepEqual(lines.slice(3, 6), ['Review focus:', '- A list saved before this change must still load.', '- The empty input is handled.']);
});

test('next-task prints no Review focus line for a plan without the section', async () => {
  const result = await finishedPlanRun(PLAN);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Review focus/);
});
