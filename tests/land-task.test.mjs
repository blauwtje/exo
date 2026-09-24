// land-task.mjs runs a task's Commit: block as the plan wrote it, checks the
// Plan-task trailer on the new commit and prints the landed set.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { landTask, LandingError } from '../skills/implementing/scripts/land-task.mjs';
import { git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/implementing/scripts/land-task.mjs', import.meta.url));

const PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'No trailer', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', trailer: false }),
  taskSection({ number: 3, title: 'No block', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', commit: false })
] });

// The block runs `git commit` outside the harness's `git()`, so the fixture
// repository carries its own identity and no signing.
async function landingCheckout() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/fixture.md': PLAN });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

async function editApp(root) {
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
}

test('a green task lands with its trailer and the landed set grows', async () => {
  const { root } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: 1$/m);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('a block without the trailer is refused before it runs', async () => {
  const { root } = await landingCheckout();
  assert.throws(() => landTask({ planText: PLAN, number: 2, root }), LandingError);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a task without a Commit: block is refused', async () => {
  const { root } = await landingCheckout();
  assert.throws(() => landTask({ planText: PLAN, number: 3, root }), /has no Commit: block/);
});

test('a failing block reports the failure', async () => {
  const { root } = await landingCheckout();
  assert.throws(() => landTask({ planText: PLAN, number: 1, root }), /Commit: block of Task 1 failed/);
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

test('a commit the landed set does not count stops with exit 1', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Price', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat: price in $USD' })
  ] });
  const { root } = await landingCheckout();
  await fs.writeFile(path.join(root, 'docs/plans/price.md'), plan);
  await editApp(root);
  const result = await run(SCRIPT, ['--plan', path.join(root, 'docs/plans/price.md'), '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Task 1 as landed: the commit's subject reads "feat: price in" and the Commit: block gives "feat: price in \$USD"/);
});
