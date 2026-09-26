// land-task.mjs runs a task's Commit: block as the plan wrote it, checks the
// Plan-task trailer on the new commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { landTask, LandingError } from '../skills/run-plan/scripts/land-task.mjs';
import { compactPlanFixture, compactTask, fixture, git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/run-plan/scripts/land-task.mjs', import.meta.url));

const PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'No trailer', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', trailer: false }),
  taskSection({ number: 3, title: 'No block', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', commit: false }),
  taskSection({ number: 4, title: 'Two files', files: ['- Modify: `src/app.js`', '- Create: `src/note.md`'], subject: 'feat(app): two files' })
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

test('a stray path outside Files: is refused before anything stages or commits', async () => {
  const { root } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  assert.throws(() => landTask({ planText: PLAN, number: 1, root }), /Task 1 changed a path outside Files: `src\/extra\.js`/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  assert.match(git(root, 'status', '--porcelain'), /extra\.js/);
});

test('a task whose changes match every Files: path lands clean', async () => {
  const { root } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  const output = landTask({ planText: PLAN, number: 4, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 4$/m);
  assert.equal(git(root, 'status', '--porcelain'), '');
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

const COMPACT_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })
] });

const PASS_REPORT = [
  'Landed: src/app.js',
  'Proof:',
  '- `node --test tests/app.test.mjs`: pass',
  '  # pass 3',
  '  # fail 0',
  'Unresolved: none',
  ''
].join('\n');

async function compactCheckout(plan = COMPACT_PLAN) {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/compact.md': plan });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await editApp(root);
  return { root, planPath: path.join(root, 'docs/plans/compact.md') };
}

async function writeReport(root, text) {
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/implementer-1.md'), text);
}

test('a compact task with no Commit: block lands on a derived commit and trailer', async () => {
  const { root } = await compactCheckout();
  const output = landTask({ planText: COMPACT_PLAN, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'feat(app): greet');
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: 1$/m);
  assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n'), ['src/app.js']);
});

// Not done without proof: each refusal exits 1 before the commit runs, so HEAD
// and the edit stay as the build left them.
async function assertRefused(root, planPath, extraArgs, stderrPattern) {
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, ...extraArgs], { cwd: root });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, stderrPattern);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
}

test('not done without proof: a compact task with no build report is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await assertRefused(root, planPath, [], /no build report/);
  await assertRefused(root, planPath, ['--report', path.join(root, 'missing.md')], /no build report/);
});

test('not done without proof: a report without a pass line for the Proof: command is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'Landed: src/app.js\nProof: the tests look fine\nnode --test: pass\n  # pass 1\n');
  await assertRefused(root, planPath, [], /no "node --test tests\/app\.test\.mjs: pass" line/);
});

test('not done without proof: a skipped or unclear proof is refused', async () => {
  const { root, planPath } = await compactCheckout();
  for (const outcome of ['skipped', 'skip', 'todo', 'pending']) {
    await writeReport(root, `node --test tests/app.test.mjs: ${outcome}\n  # tests 0\n`);
    await assertRefused(root, planPath, [], /was skipped/);
  }
  for (const outcome of ['fail', 'passed?', 'unclear']) {
    await writeReport(root, `node --test tests/app.test.mjs: ${outcome}\n  # tests 1\n`);
    await assertRefused(root, planPath, [], /no clear pass/);
  }
  await writeReport(root, `${PASS_REPORT}node --test tests/app.test.mjs: skipped\n`);
  await assertRefused(root, planPath, [], /was skipped/);
});

test('not done without proof: a pass line with no output under it is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'node --test tests/app.test.mjs: pass\n\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /no output under/);
});

test('a report with a clear pass lands and records the SHA and the proof output', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, PASS_REPORT);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const sha = git(root, 'rev-parse', '--short', 'HEAD');
  assert.match(result.stdout, new RegExp(`^Committed: ${sha} Task 1$`, 'm'));
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3\n {2}# fail 0$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'feat(app): greet');
});

test('--report names a report outside the default path', async () => {
  const { root, planPath } = await compactCheckout();
  // Outside the checkout entirely: a report path inside root's working tree
  // would itself be an untracked path the new scope check refuses.
  const reportPath = path.join(await fixture(), 'build-report.md');
  await fs.writeFile(reportPath, PASS_REPORT);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', reportPath], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
});

test('a commit the landed set does not count stops with exit 1', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Price', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat: price in $USD' })
  ] });
  const { root } = await landingCheckout();
  await fs.writeFile(path.join(root, 'docs/plans/price.md'), plan);
  git(root, 'add', 'docs/plans/price.md');
  git(root, 'commit', '-q', '-m', 'chore: add the price plan');
  await editApp(root);
  const result = await run(SCRIPT, ['--plan', path.join(root, 'docs/plans/price.md'), '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Task 1 as landed: the commit's subject reads "feat: price in" and the Commit: block gives "feat: price in \$USD"/);
});

// An older compact plan names no `Proof:`, so build-task writes or picks one
// test for the Success criterion; that test's pass line is the proof.
const OLDER_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: null })
] });

test('a compact task without Proof: lands on the pass line of the test the builder ran', async () => {
  const { root, planPath } = await compactCheckout(OLDER_PLAN);
  await writeReport(root, 'Landed: src/app.js\nProof:\n- `node --test tests/greet.test.mjs`: pass\n  # pass 1\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/greet\.test\.mjs: pass\n {2}# pass 1$/m);
  assert.match(result.stdout, /^Landed: 1$/m);
});

test('not done without proof: a compact task without Proof: and no passing test is refused', async () => {
  const { root, planPath } = await compactCheckout(OLDER_PLAN);
  await assertRefused(root, planPath, [], /no build report/);
  await writeReport(root, 'Landed: src/app.js\nProof: the tests look fine\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /no "<test>: pass" line/);
  await writeReport(root, 'node --test tests/greet.test.mjs: fail\n  # fail 1\n');
  await assertRefused(root, planPath, [], /no clear pass/);
  await writeReport(root, 'node --test tests/greet.test.mjs: skipped\n  # tests 0\n');
  await assertRefused(root, planPath, [], /was skipped/);
  await writeReport(root, 'node --test tests/greet.test.mjs: pass\n\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /no output under/);
});

test('the proof output stops at the next outcome line in an indented Proof list', async () => {
  const { root } = await compactCheckout();
  const report = 'Proof:\n  - `node --test tests/app.test.mjs`: pass\n    # pass 3\n  - `npm run lint`: pass\n    0 problems\n';
  const output = landTask({ planText: COMPACT_PLAN, number: 1, root, reportText: report });
  assert.match(output, /^Proof: node --test tests\/app\.test\.mjs: pass\n {4}# pass 3\nLanded: 1$/m);
});

// land-task.mjs refused these four shapes from a real run (tasks 7, 9, 10, 11
// of a second run-unit): the report was genuinely green, but its pass line
// and output shared the same indentation, so the old "output must sit deeper
// than its outcome line" rule read the report as having no output at all.
test('a report whose output sits at the same indentation as its pass line still lands', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'Task 1: GREEN\nnode --test tests/app.test.mjs: pass\npass: 3 cases\nReport: /tmp/implementer-1.md\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\npass: 3 cases$/m);
});

test('a pass line indented inside a markdown list, with output at no indentation, still lands', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, '- `node --test tests/app.test.mjs`: pass\n# pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n# pass 3$/m);
});

test('a blank line between the pass line and its output still lands', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'node --test tests/app.test.mjs: pass\n\n  # pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3$/m);
});

test('trailing whitespace and CRLF line endings on the report still land', async () => {
  const { root, planPath } = await compactCheckout();
  const report = 'node --test tests/app.test.mjs: pass  \r\n  # pass 3\r\nUnresolved: none\r\n';
  await writeReport(root, report);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3$/m);
});

test('the next report field ends the output with no blank line between them', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'node --test tests/app.test.mjs: pass\n  # pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3$/m);
  assert.doesNotMatch(result.stdout, /Unresolved/);
});
