// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { git, gitRepository, planFixture, run } from './harness.mjs';
import { taskSection, SCRIPT, PLAN, landingCheckout, editApp, withLint } from './land-task-fixture.mjs';

test('a green task lands with its trailer and the landed set grows', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1\nRoute: unit \(\d+ tasks\)\nNext: Task 2$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('a landing in a checkout under .claude/worktrees/ names the next task, while a main checkout names the wave', async () => {
  const plan = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Left', files: ['- Create: `src/left.js`'], subject: 'feat(app): left' }),
    taskSection({ number: 3, title: 'Right', files: ['- Create: `src/right.js`'], subject: 'feat(app): right' })
  ] });
  const { root } = await landingCheckout();
  const isolated = path.join(root, '.claude', 'worktrees', 'feat+x');
  git(root, 'worktree', 'add', '-q', '-b', 'feat/x', isolated);
  await editApp(isolated);
  const isolatedPlan = path.join(isolated, 'docs/plans/fixture.md');
  assert.match(landTask({ planPath: isolatedPlan, planText: plan, number: 1, root: isolated }), /\nLanded: 1\nRoute: unit \(.+\)\nNext: Task 2\n$/);
  const main = await landingCheckout();
  await editApp(main.root);
  assert.match(landTask({ planPath: main.planPath, planText: plan, number: 1, root: main.root }), /\nLanded: 1\nRoute: unit \(.+\)\nWave: Task 2, Task 3\n$/);
});

test('a block without the trailer is refused before it runs', async () => {
  const { root, planPath } = await landingCheckout();
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 2, root }), LandingError);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a task without a Commit: block is refused', async () => {
  const { root, planPath } = await landingCheckout();
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 3, root }), /has no Commit: block/);
});

test('a failing block reports the failure', async () => {
  const { root, planPath } = await landingCheckout();
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n'); // as in a real checkout, so the recorded pass is not committed
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 1, root }), /Commit: block of Task 1 failed/);
});

test('a stray path outside Files: is refused before anything stages or commits', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 1, root }), /Task 1 changed a path outside Files: `src\/extra\.js`/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  assert.match(git(root, 'status', '--porcelain'), /extra\.js/);
});

test('a task whose changes match every Files: path lands clean', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  const output = landTask({ planPath, planText: PLAN, number: 4, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 4$/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('Lint runs on the task Files script paths, without a shell, and a passing run lands', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  const tools = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-lint-'));
  const record = path.join(tools, 'lint-args.txt');
  const linter = path.join(tools, 'linter.sh');
  await fs.writeFile(linter, `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\n`, { mode: 0o755 });
  const output = landTask({ planPath, planText: withLint(`${linter} --quiet`), number: 4, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 4$/m);
  assert.equal(await fs.readFile(record, 'utf8'), '--quiet\nsrc/app.js\n');
});

test('a failing Lint is refused before anything commits, naming the command and its output', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const linter = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'exo-lint-')), 'linter.sh');
  await fs.writeFile(linter, '#!/bin/sh\necho lint broke\nexit 1\n', { mode: 0o755 });
  assert.throws(
    () => landTask({ planPath, planText: withLint(linter), number: 1, root }),
    /Lint ".*linter\.sh" failed:\nlint broke/
  );
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('Lint: none and a task with no script path run nothing', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: withLint('none'), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  const notes = planFixture({ tasks: [taskSection({ number: 1, title: 'Note', files: ['- Create: `src/note.md`'], subject: 'docs: note' })] })
    .replace('Branch: feat/fixture', 'Branch: feat/fixture\nLint: false');
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  const noted = landTask({ planPath, planText: notes, number: 1, root });
  assert.match(noted, /^Committed: [0-9a-f]+ Task 1$/m);
});

// A checkout that tracks `src/old.mjs`, deleted in the working tree, plus a
// recording linter, so a test sees exactly which paths reached the linter.
async function deletedScriptCheckout(files) {
  const plan = planFixture({ tasks: [taskSection({ number: 1, title: 'Drop old', files, subject: 'refactor(app): drop old' })] });
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'src/old.mjs': 'export const old = 1;\n', 'docs/plans/fixture.md': plan });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.rm(path.join(root, 'src/old.mjs'));
  const tools = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-lint-'));
  const record = path.join(tools, 'lint-args.txt');
  const linter = path.join(tools, 'linter.sh');
  await fs.writeFile(linter, `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\n`, { mode: 0o755 });
  const planText = plan.replace('Branch: feat/fixture', `Branch: feat/fixture\nLint: ${linter}`);
  return { root, planPath: path.join(root, 'docs/plans/fixture.md'), planText, record };
}

test('a task whose only script path it deleted runs no Lint and lands', async () => {
  const { root, planPath, planText, record } = await deletedScriptCheckout(['- Modify: `src/old.mjs`']);
  const output = landTask({ planPath, planText, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  await assert.rejects(fs.access(record), { code: 'ENOENT' });
});

test('Lint gets only the task script paths that still exist, never a deleted one', async () => {
  const { root, planPath, planText, record } = await deletedScriptCheckout(['- Modify: `src/old.mjs`', '- Modify: `src/app.js`']);
  await editApp(root);
  const output = landTask({ planPath, planText, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.equal(await fs.readFile(record, 'utf8'), 'src/app.js\n');
});

test('an untracked plan inside the checkout is never a stray, and the task lands', async () => {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  const planPath = path.join(root, 'docs/specs/topic.md');
  await fs.mkdir(path.join(root, 'docs/specs'), { recursive: true });
  await fs.writeFile(planPath, PLAN);
  await editApp(root);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
});

test('the command line lands a task, and a refusal leaves stdout empty', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const good = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /^Landed: 1$/m);
  const noTask = await run(SCRIPT, ['--plan', planPath, '--root', root], { cwd: root });
  assert.equal(noTask.code, 2);
  assert.equal(noTask.stdout, '');
  assert.match(noTask.stderr, /--task/);
  const noTrailer = await run(SCRIPT, ['--plan', planPath, '--task', '2', '--root', root], { cwd: root });
  assert.equal(noTrailer.code, 1);
  assert.equal(noTrailer.stdout, '');
  assert.match(noTrailer.stderr, /Plan-task: 2/);
});
