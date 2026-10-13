// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixLand, landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, git, gitRepository, run } from './harness.mjs';
import {
  compactTask, SCRIPT, PLAN, landingCheckout, editApp, withLint, compactCheckout, assertRefused
} from './land-task-fixture.mjs';

async function fixCheckout() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}

test('--fix commits every changed path, tracked or not, with the given subject', async () => {
  const root = await fixCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const output = fixLand({ root, subject: 'fix(app): address the branch review' });
  assert.match(output, /^Committed: [0-9a-f]+$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'fix(app): address the branch review');
  assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n').sort(), ['src/app.js', 'src/extra.js']);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('--fix refuses an attributing or untyped subject before anything stages or commits', async () => {
  const root = await fixCheckout();
  await editApp(root);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.throws(() => fixLand({ root, subject: 'fix(app): done\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }), /commit text refused.*attribute/);
  assert.throws(() => fixLand({ root, subject: 'address the review' }), /commit text refused.*Conventional Commits/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'status', '--porcelain', '--', 'src'), /app\.js/);
});

test('a task whose subject is not a Conventional Commit is refused before it commits', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'greet the user', files: ['src/app.js'], proof: 'node tests/app.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  const head = git(root, 'rev-parse', 'HEAD');
  await assertRefused(root, planPath, [], /commit text refused.*Conventional Commits/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

async function lintPlan(linterBody) {
  const tools = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-fix-lint-'));
  const linter = path.join(tools, 'linter.sh');
  await fs.writeFile(linter, linterBody, { mode: 0o755 });
  const planPath = path.join(tools, 'plan.md');
  await fs.writeFile(planPath, withLint(`${linter} --quiet`));
  return { tools, planPath };
}

test('--fix with a plan lints the changed script paths that still exist, then commits', async () => {
  const root = await fixCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  const record = path.join(os.tmpdir(), `exo-fix-record-${process.pid}.txt`);
  const { planPath } = await lintPlan(`#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\n`);
  fixLand({ root, subject: 'fix(app): address the branch review', plan: planPath });
  assert.equal(await fs.readFile(record, 'utf8'), '--quiet\nsrc/app.js\n');
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('--fix with a plan whose Lint fails refuses the commit and leaves the changes', async () => {
  const root = await fixCheckout();
  await editApp(root);
  const { planPath } = await lintPlan('#!/bin/sh\necho lint broke\nexit 1\n');
  assert.throws(
    () => fixLand({ root, subject: 'fix(app): address the branch review', plan: planPath }),
    /Lint ".*linter\.sh --quiet" failed:\nlint broke/
  );
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  assert.match(git(root, 'status', '--porcelain'), /app\.js/);
});

test('the command line --fix passes --plan to the lint', async () => {
  const root = await fixCheckout();
  await editApp(root);
  const { planPath } = await lintPlan('#!/bin/sh\necho lint broke\nexit 1\n');
  const result = await run(SCRIPT, ['--fix', 'fix(app): address the branch review', '--plan', planPath, '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Lint ".*" failed/);
});

test('--fix on a clean checkout is refused', async () => {
  const root = await fixCheckout();
  assert.throws(() => fixLand({ root, subject: 'fix(app): nothing changed' }), /no changed path to commit/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('the command line --fix commits every changed path with that subject', async () => {
  const root = await fixCheckout();
  await editApp(root);
  const result = await run(SCRIPT, ['--fix', 'fix(app): address the branch review', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Committed: [0-9a-f]+$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'fix(app): address the branch review');
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('a --root whose toplevel matches the checkout lands clean', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a --root that is a subdirectory of the checkout is refused before anything stages or commits', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const subdirectory = path.join(root, 'src');
  assert.throws(
    () => landTask({ planPath, planText: PLAN, number: 1, root: subdirectory }),
    (error) => error instanceof LandingError
      && error.message.includes(subdirectory)
      && error.message.includes(root)
      && error.message.includes('is not the checkout toplevel')
  );
  assert.equal(git(root, 'status', '--porcelain').trim(), 'M src/app.js');
});
