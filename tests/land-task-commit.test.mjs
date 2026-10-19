// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkTask, landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, git, gitRepository, planFixture, run } from './harness.mjs';
import {
  taskSection, SCRIPT, PLAN, landingCheckout, editApp, withLint, compactTask, compactCheckout, writeReport, PASS_REPORT, assertRefused
} from './land-task-fixture.mjs';

test('a green task lands with its trailer and the landed set grows', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1\nRoute: unit \(\d+ tasks\)\nThen: node ".+next-task\.mjs" --block --plan ".+" --root ".+"$/m);
  assert.doesNotMatch(output, /^(?:Next|Wave): Task \d/m); // only next-task.mjs writes a brief, so a landing names no task to dispatch
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('a landing in a checkout under .claude/worktrees/ or a main checkout points at next-task.mjs and names no task', async () => {
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
  assert.match(landTask({ planPath: isolatedPlan, planText: plan, number: 1, root: isolated }), /\nLanded: 1\nRoute: unit \(.+\)\nThen: node ".+next-task\.mjs" --block --plan ".+" --root ".+"\n$/);
  const main = await landingCheckout();
  await editApp(main.root);
  const mainOutput = landTask({ planPath: main.planPath, planText: plan, number: 1, root: main.root });
  assert.match(mainOutput, /\nLanded: 1\nRoute: unit \(.+\)\nThen: node ".+next-task\.mjs" --block --plan ".+" --root ".+"\n$/);
  assert.doesNotMatch(mainOutput, /^(?:Next|Wave): Task \d/m);
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

test('a git worktree nested in the checkout is skipped, a plain untracked directory beside it is still refused', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  git(root, 'worktree', 'add', '-q', '-b', 'feat/nested', path.join(root, 'agents', 'agent-1'));
  git(root, 'worktree', 'add', '-q', '-b', 'feat/gone', path.join(root, 'agents', 'agent-gone'));
  await fs.rm(path.join(root, 'agents', 'agent-gone'), { recursive: true }); // prunable: still listed, directory gone
  await fs.mkdir(path.join(root, 'stray'));
  await fs.writeFile(path.join(root, 'stray', 'file.txt'), 'x\n');
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 1, root }), (error) => /changed a path outside Files: `stray\/file\.txt`/.test(error.message) && !error.message.includes('agent-1'));
  await fs.rm(path.join(root, 'stray'), { recursive: true });
  assert.match(landTask({ planPath, planText: PLAN, number: 1, root }), /^Committed: [0-9a-f]+ Task 1$/m);
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

test('under a run pin, --check runs any task of the pinned plan while a landing stays on the pinned task', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const pin = { planId: 'fixture', number: 2 };
  const output = checkTask({ planPath, planText: PLAN, number: 1, root, pin });
  assert.match(output, /Report OK: Task 1\n$/);
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 1, root, pin }), (error) => {
    assert.ok(error instanceof LandingError);
    assert.equal(error.message, 'EXO_RUN_TASK pins this run to fixture/2; Task 1 of fixture is refused');
    return true;
  });
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
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

const literalPlan = (data, escape = '') => compactPlanFixture({ tasks: [
  `${compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], data, proof: 'node tests/app.test.mjs' })}${escape}`
] }).replace('## Plan basis\n', '## Plan basis\nLand gate: true\n');

test('a Data literal found nowhere in the change or the tree is refused, naming the string and the escape', async () => {
  const { root, planPath } = await compactCheckout(literalPlan('names `zzqq_absent_literal` and `greet`'));
  await writeReport(root, PASS_REPORT);
  await assertRefused(root, planPath, [], /Data: names `zzqq_absent_literal`, .*Literals: none \(<reason>\)/);
});

test('a Data literal that is present, a path with a line suffix, a placeholder form or an escaped task lands', async () => {
  const data = 'names `greet`, `src/app.js:1-2` and `greet(<arg>)`';
  const present = await compactCheckout(literalPlan(data));
  assert.match(landTask({ planPath: present.planPath, planText: literalPlan(data), number: 1, root: present.root, reportText: PASS_REPORT }), /^Committed: [0-9a-f]+ Task 1$/m);
  const escapedPlan = literalPlan('names `zzqq_absent_literal`', ' | Literals: none (prose)');
  const escaped = await compactCheckout(escapedPlan);
  assert.match(landTask({ planPath: escaped.planPath, planText: escapedPlan, number: 1, root: escaped.root, reportText: PASS_REPORT }), /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a test-first task whose change touches no test file is refused before anything commits', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'fix(app): greet', files: ['src/app.js', 'tests/app.test.mjs'], proof: 'node tests/app.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  await writeReport(root, PASS_REPORT);
  await assertRefused(root, planPath, [], /Task 1 is test-first, but its change adds or changes no test file/);
});

test('a compact task with an Evidence field lands it as a trailer after Plan-task, quotes and substitutions inert', async () => {
  const evidence = `see 'docs/x.md' $(touch pwned) \`id\` "q"`;
  const plan = compactPlanFixture({ tasks: [
    `${compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' })} | Evidence: ${evidence}`
  ] });
  const { root, planPath } = await compactCheckout(plan);
  await writeReport(root, PASS_REPORT);
  landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  const body = git(root, 'log', '-1', '--format=%B');
  assert.match(body, /^Plan-task: compact\/1\nEvidence: see 'docs\/x\.md' \$\(touch pwned\) `id` "q"$/m);
  await assert.rejects(fs.access(path.join(root, 'pwned')));
});

test('a compact task without Evidence lands no Evidence trailer', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, PASS_REPORT);
  landTask({ planPath, planText: await fs.readFile(planPath, 'utf8'), number: 1, root, reportText: PASS_REPORT });
  assert.doesNotMatch(git(root, 'log', '-1', '--format=%B'), /Evidence:/);
});
