import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { resolvePlanPath } from '../lib/checkout.mjs';
import { git, run, tempDir } from './harness.mjs';
import { landingCheckout, SCRIPT as LAND_TASK } from './land-task-fixture.mjs';

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
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', worktree, '--frame'], { cwd: worktree });
  assert.doesNotMatch(result.stderr, /no plan at/);
  assert.equal(result.code, 0, result.stderr);
});
