// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixLand, landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, compactTask, fixture, git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-task.mjs', import.meta.url));

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
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1\nNext: Task 2$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
  assert.equal(git(root, 'status', '--porcelain'), '');
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
  assert.equal(git(root, 'status', '--porcelain'), '');
});

// planFixture carries no Land gate line; this inserts one into the same
// Plan basis frame so the gate tests exercise the real grammar, not a
// hand-rolled plan shape.
function withLandGate(command) {
  return PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);
}

function withLint(command) {
  return PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLint: ${command}`);
}

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

test('a passing Land gate lets a green task land', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: withLandGate('true'), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
});

test('a passing Land gate leaves a record of the landed tree, the gate and the passed Proof', async () => {
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('## Plan basis\n', '## Plan basis\nLand gate: true\n'));
  const plan = await fs.readFile(planPath, 'utf8');
  landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  const record = JSON.parse(await fs.readFile(path.join(root, '.exo/land-gate-compact.json'), 'utf8'));
  assert.deepEqual(record, { tree: git(root, 'rev-parse', 'HEAD^{tree}'), gate: 'true', proofs: ['node --test tests/app.test.mjs'] });
});

test('no record is written when no Land gate ran', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  landTask({ planPath, planText: PLAN, number: 1, root });
  await assert.rejects(fs.access(path.join(root, '.exo/land-gate-fixture.json')));
});

test('a failing Land gate is refused before anything commits, naming the command and its output', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  assert.throws(
    () => landTask({ planPath, planText: withLandGate('echo gate broke && exit 1'), number: 1, root }),
    /Land gate "echo gate broke && exit 1" failed:\ngate broke/
  );
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a plan with no Land gate line lands as before', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('Land gate: none opts out and lands as before', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const output = landTask({ planPath, planText: withLandGate('none'), number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
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
  const { root, planPath } = await compactCheckout();
  const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'feat(app): greet');
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
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

test('not done without proof: a passing Proof: beside another failing command in the Proof section is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, [
    'Landed: src/app.js',
    'Proof:',
    'node --test tests/app.test.mjs: pass',
    '  # pass 3',
    'npm test: fail (13 of 14 pass; the one failure is outside Files, see Unresolved)',
    '  ✖ importRows turns each bank row into an entry',
    '',
    'Unresolved:',
    '- npm test: fail until a follow-up task passes the date through importRows.',
    ''
  ].join('\n'));
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: fail \(13 of 14 pass; the one failure is outside Files, see Unresolved\)" under Proof, no clear pass$/m);
});

test('not done without proof: a bare "fail" line or a backticked failing word in the Proof section is refused', async () => {
  const { root, planPath } = await compactCheckout();
  const passing = 'Proof:\n- `node --test tests/app.test.mjs`: pass\n  # pass 3\n';
  await writeReport(root, `${passing}npm test: fail\n  ✖ importRows\nUnresolved: none\n`);
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: fail" under Proof, no clear pass$/m);
  await writeReport(root, `${passing}- \`npm test\`: failing on importRows\n  ✖ importRows\nUnresolved: none\n`);
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: failing on importRows" under Proof, no clear pass$/m);
});

// A bare colon line under a passing command is as likely that command's own
// output, so a test name holding "fail" does not refuse a green task.
test('a passing proof whose output names a failing case still lands', async () => {
  for (const outputLine of ['ok 3 - parser: fails on empty input', '✔ importRows: failed rows are skipped (2ms)']) {
    const { root, planPath } = await compactCheckout();
    const report = `Proof:\n- \`node --test tests/app.test.mjs\`: pass\n  ${outputLine}\n  # fail 0\nUnresolved: none\n`;
    const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: report });
    assert.match(output, /^Landed: 1$/m, outputLine);
  }
});

test('a Proof section whose every command passes still lands', async () => {
  const { root, planPath } = await compactCheckout();
  const report = 'Proof:\n- `node --test tests/app.test.mjs`: pass\n  # pass 3\n  # fail 0\n- `npm test`: pass\n  # fail 0\nUnresolved: none\n';
  const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: report });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
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

test('a one-line report with the pass line after a Proof: prefix still lands', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'Landed: src/app.js\nProof: node --test tests/app.test.mjs: pass\n  # pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3$/m);
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

test('a commit whose subject the plan does not give stops with exit 1', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Price', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat: price in $USD' })
  ] });
  const { root, planPath } = await landingCheckout();
  await fs.writeFile(path.join(root, 'docs/plans/price.md'), plan);
  git(root, 'add', 'docs/plans/price.md');
  git(root, 'commit', '-q', '-m', 'chore: add the price plan');
  await editApp(root);
  const result = await run(SCRIPT, ['--plan', path.join(root, 'docs/plans/price.md'), '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /carries "Plan-task: price\/1", yet its subject reads "feat: price in" and the plan gives "feat: price in \$USD"/);
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
  const { root, planPath } = await compactCheckout();
  const report = 'Proof:\n  - `node --test tests/app.test.mjs`: pass\n    # pass 3\n  - `npm run lint`: pass\n    0 problems\n';
  const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: report });
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
  assert.equal(git(root, 'status', '--porcelain'), '');
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
  assert.equal(git(root, 'status', '--porcelain'), '');
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
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('the next report field ends the output with no blank line between them', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'node --test tests/app.test.mjs: pass\n  # pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node --test tests\/app\.test\.mjs: pass\n {2}# pass 3$/m);
  assert.doesNotMatch(result.stdout, /Unresolved/);
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

// Above eight tasks the report's `Choice:` lines become the decision log
// beside the plan; at eight or fewer nothing is written.
function planOfTasks(count) {
  const tasks = Array.from({ length: count }, (_, index) => compactTask({
    number: index + 1,
    title: `feat(app): step ${index + 1}`,
    files: index === 0 ? ['src/app.js'] : [`src/step-${index + 1}.js`],
    proof: 'node --test tests/app.test.mjs'
  }));
  return compactPlanFixture({ tasks });
}

const CHOICE_REPORT = PASS_REPORT.replace('Unresolved: none', 'Choice: kept the default timeout\n- Choice: used a plain object\nUnresolved: none');

test('above eight tasks each Choice: line is appended to the decision log beside the plan', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  const output = landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  const sha = git(root, 'rev-parse', '--short', 'HEAD');
  assert.match(output, /^Landed: 1$/m);
  const log = await fs.readFile(path.join(root, 'docs/plans/compact-decisions.md'), 'utf8');
  assert.equal(log, `Task 1 ${sha}: kept the default timeout\nTask 1 ${sha}: used a plain object\n`);
});

test('the decision log is no stray for the next task', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  await fs.writeFile(path.join(root, 'src/step-2.js'), 'export const step = 2;\n');
  const output = landTask({ planText: plan, number: 2, root, reportText: PASS_REPORT, planPath });
  assert.match(output, /^Landed: 1, 2$/m);
});

test('at eight tasks or fewer the Choice: lines write no decision log', async () => {
  const plan = planOfTasks(8);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  await assert.rejects(fs.access(path.join(root, 'docs/plans/compact-decisions.md')));
});

test('above eight tasks a report with no Choice: line writes no decision log', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: PASS_REPORT, planPath });
  await assert.rejects(fs.access(path.join(root, 'docs/plans/compact-decisions.md')));
});

// A task that changes an exported signature lands only when every caller of
// that name sits inside its Files:, since a caller outside it breaks unseen.
const SIGNATURE_PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Book date', files: ['- Modify: `src/ledger/create-entry.js`'], subject: 'feat(ledger): book date' }),
  taskSection({ number: 2, title: 'Book date everywhere', files: ['- Modify: `src/ledger/create-entry.js`', '- Modify: `src/import/import-rows.js`'], subject: 'feat(ledger): book date everywhere' })
] });

async function signatureCheckout() {
  const root = await gitRepository({
    'src/ledger/create-entry.js': 'export function createEntry(id, description, amount) {\n  return { id, description, amount };\n}\n',
    'src/import/import-rows.js': "import { createEntry } from '../ledger/create-entry.js';\nexport const importRows = (rows) => rows.map((row) => createEntry(row.id, row.text, row.amount));\n",
    'docs/plans/fixture.md': SIGNATURE_PLAN
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

async function requireBookedOn(root) {
  await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), 'export function createEntry(id, description, amount, bookedOn) {\n  return { id, description, amount, bookedOn };\n}\n');
}

test('a changed export signature with a caller outside Files: is refused as PLAN DRIFT', async () => {
  const { root, planPath } = await signatureCheckout();
  await requireBookedOn(root);
  const drift = 'PLAN DRIFT: Task 1: src/ledger/create-entry.js:createEntry(id, description, amount) -> (id, description, amount, bookedOn); callers outside Files: src/import/import-rows.js';
  assert.throws(() => landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root }), (error) => error instanceof LandingError && error.message === drift);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `${drift}\n`);
});

test('a changed export signature with every caller inside Files: lands', async () => {
  const { root, planPath } = await signatureCheckout();
  await requireBookedOn(root);
  await fs.writeFile(path.join(root, 'src/import/import-rows.js'), "import { createEntry } from '../ledger/create-entry.js';\nexport const importRows = (rows) => rows.map((row) => createEntry(row.id, row.text, row.amount, row.date));\n");
  const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 2, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 2\nLanded: 2\nNext: Task 1\n$/);
  const message = git(root, 'log', '-1', '--format=%B');
  assert.match(message, /^Plan-task: fixture\/2\nSignature: src\/ledger\/create-entry\.js:createEntry\(id, description, amount\) -> \(id, description, amount, bookedOn\)$/m);
});

// Only a change a caller can feel refuses: more required parameters, fewer
// parameters in total, or a rest parameter taken away.
const CALLER_SAFE_SIGNATURES = {
  'a renamed parameter': '(entryId, description, amount)',
  'an added default parameter': "(id, description, amount, bookedOn = '')",
  'an added optional typed parameter': '(id, description, amount, bookedOn?)',
  'an added rest parameter': '(id, description, amount, ...notes)'
};

for (const [change, parameters] of Object.entries(CALLER_SAFE_SIGNATURES)) {
  test(`${change} on an export with an outside caller lands`, async () => {
    const { root, planPath } = await signatureCheckout();
    await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), `export function createEntry${parameters} {\n  return {};\n}\n`);
    const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root });
    assert.match(output, /^Committed: [0-9a-f]+ Task 1\nLanded: 1\nNext: Task 2\n$/);
  });
}

const CALLER_BREAKING_SIGNATURES = {
  'a dropped parameter': ['(id, description, amount)', '(id, description)'],
  'a default turned required': ["(id, description, amount = 0)", '(id, description, amount)'],
  'a rest parameter taken away': ['(id, ...parts)', '(id, parts)']
};

for (const [change, [before, after]] of Object.entries(CALLER_BREAKING_SIGNATURES)) {
  test(`${change} on an export with an outside caller is refused as PLAN DRIFT`, async () => {
    const { root, planPath } = await signatureCheckout();
    const file = path.join(root, 'src/ledger/create-entry.js');
    await fs.writeFile(file, `export function createEntry${before} {}\n`);
    git(root, 'commit', '-q', '-am', 'set up the old signature');
    await fs.writeFile(file, `export function createEntry${after} {}\n`);
    assert.throws(() => landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root }), (error) => error instanceof LandingError && /^PLAN DRIFT: Task 1: src\/ledger\/create-entry\.js:createEntry\(/.test(error.message));
  });
}

test('a body-only change to an export with an outside caller lands and prints nothing extra', async () => {
  const { root, planPath } = await signatureCheckout();
  await fs.writeFile(path.join(root, 'src/ledger/create-entry.js'), 'export function createEntry(id,  description,\n  amount) {\n  return { id, description, amount: Number(amount) };\n}\n');
  const output = landTask({ planPath, planText: SIGNATURE_PLAN, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1\nLanded: 1\nNext: Task 2\n$/);
});
