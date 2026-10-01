// verify.mjs runs each landed task's Proof command, the plan's own Land
// gate (or npm run check) and a stray-path check, then prints the REVIEWER
// line pick-reviewer.mjs's size facts pick. "Landed" comes from #plan-tasks'
// own landedTasks(), the same read land-task.mjs uses, so a task with no
// `Plan-task: <plan-id>/<n>` commit never runs its Proof here either.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { criterionCommand, findStrayPaths, manualChecks, runnableProof, successCriterionPasses, taskStates } from '../skills/verify/scripts/verify.mjs';
import { git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

function landTask(root, number) {
  git(root, 'commit', '--allow-empty', '-m', `chore: land task ${number}`, '-m', `Plan-task: plan/${number}`);
}

test('findStrayPaths keeps only paths no task declared', () => {
  const tasks = [
    { number: 1, files: [{ path: 'src/app.js' }] },
    { number: 2, files: [{ path: 'src/broken.js' }] }
  ];
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/extra.js']), ['src/extra.js']);
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/broken.js']), []);
});

test('runnableProof reads a plain Proof as its command, and a backticked one as prose', () => {
  assert.equal(runnableProof('node -e "process.exit(0)"'), 'node -e "process.exit(0)"');
  assert.equal(runnableProof('npm run validate, whose output holds no `[FAIL]` line'), null);
  assert.equal(runnableProof(null), null);
});

test('successCriterionPasses reads the clean SUMMARY line', () => {
  assert.equal(successCriterionPasses('SUMMARY FAIL=0 WARN=0 UNRUN=0\n'), true);
  assert.equal(successCriterionPasses('SUMMARY FAIL=1 WARN=0 UNRUN=0\n'), false);
  assert.equal(successCriterionPasses(''), false);
});

test('criterionCommand reads the first backticked command, or null', () => {
  assert.equal(criterionCommand('`npm test` passes, as does `npm run lint`.'), 'npm test');
  assert.equal(criterionCommand('the suite passes'), null);
  assert.equal(criterionCommand(null), null);
});

const CLEAN_CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";
const FAILING_CHECK = "console.log('check failed'); process.exit(1);\n";

test('a landed task, a clean check and no stray paths print PASS lines and the light reviewer agent', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
});

test('a landed task whose Proof fails prints FAIL and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): break\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1');
});

test('an unlanded task never runs its Proof', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): break\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"\n',
    'check.js': CLEAN_CHECK
  });

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim().split('\n')[0], 'PASS success-criterion');
});

test('a Proof: with a backtick reads as prose and is skipped, never handed to a shell', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: npm run validate, whose output holds no `[FAIL]` line\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.split('\n')[0].startsWith('SKIP Task 1'));
});

test('a failing check-command prints FAIL success-criterion', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': FAILING_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'FAIL success-criterion', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
});

test("the plan's own Land gate runs when --check-command is not given", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: node check.js', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('PASS success-criterion'));
});

test("a plan's 'Land gate: none' prints UNRUN, not PASS, and does not fail", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: none', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('UNRUN success-criterion (Land gate: none)'));
  assert.ok(!result.stdout.includes('PASS success-criterion'));
});

const SUITE_PROOF_PLAN = (gate) => [
  '## Plan basis', '', 'Repository: .', 'Branch: main', ...(gate ? [`Land gate: ${gate}`] : []), '',
  '### Task 1: feat(app): greet',
  'Depends on: none | Files: `src/app.js` | Data: none | Proof: npm test',
  ''
].join('\n');
// npm test, not node --test: a nested node --test inherits this runner's NODE_TEST_CONTEXT and exits 0.
const FAILING_SUITE_PACKAGE = (scripts) => JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"', ...scripts } });

test('a test-suite Proof runs under a custom Land gate, which may run no tests', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': SUITE_PROOF_PLAN('node check.js'),
    'check.js': CLEAN_CHECK,
    'package.json': FAILING_SUITE_PACKAGE({})
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1');
});

test('a test-suite Proof is skipped under the default gate, which runs that suite', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': SUITE_PROOF_PLAN(null),
    'package.json': FAILING_SUITE_PACKAGE({ check: 'node check.js' }),
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  assert.equal(lines[1], 'PASS success-criterion');
});

test("the Success criterion's command is the gate, and a task Proof equal to it is skipped", async () => {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '## Success criterion', '`node check.js` passes.', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node check.js',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'));
  assert.equal(lines[1], 'PASS success-criterion');
});

test('a change outside every declared Files prints a STRAY line and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);
  await import('node:fs/promises').then((fs) => fs.writeFile(path.join(root, 'src', 'extra.js'), 'export const stray = 1;\n'));

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('STRAY src/extra.js'));
});

test('--root points the gate at another checkout, not the caller\'s own cwd', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(
    SCRIPT,
    ['--plan', path.join(root, 'plan.md'), '--root', root, '--check-command', 'node check.js'],
    { cwd: path.dirname(root) }
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', `REVIEWER: ${REVIEWER_AGENTS.light}`, 'DONE Task 1: feat(app): greet']);
});

test('missing --plan is rejected', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n' });
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--plan/);
});

test('taskStates and manualChecks read the done tasks and the Manual checks bullets', () => {
  const tasks = [{ number: 1, title: 'a' }, { number: 2, title: 'b' }];
  assert.deepEqual(taskStates(tasks, new Set([1])), [{ task: 1, title: 'a', done: true }, { task: 2, title: 'b', done: false }]);
  assert.deepEqual(manualChecks({ 'Manual checks': '- Click the badge.\n- Check the account.' }), ['Click the badge.', 'Check the account.']);
  assert.deepEqual(manualChecks({}), []);
});

test('the run ends on every task and the plan\'s manual checks', async () => {
  const plan = [
    '## Manual checks', '- Click the badge in the task list.', '',
    '## Plan basis', '', 'Repository: .', 'Branch: main', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    '',
    '### Task 2: feat(app): wave',
    'Depends on: 1 | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': CLEAN_CHECK });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').slice(-3), ['DONE Task 1: feat(app): greet', 'OPEN Task 2: feat(app): wave', 'MANUAL Click the badge in the task list.']);
});

test('per-task Proofs overlap, at most 3 at once, and print in task order', async () => {
  // Each Proof logs +/- around a pause, so the log's running sum is how many ran at once.
  // The log sits outside the checkout, or the stray-path check would flag it.
  const logPath = path.join(await mkdtemp(path.join(tmpdir(), 'verify-gate-')), 'log.txt');
  const proof = (delay) => `node -e "const fs=require('fs');fs.appendFileSync('${logPath}','+\\\\n');setTimeout(()=>{fs.appendFileSync('${logPath}','-\\\\n')},${delay})"`;
  const tasks = [500, 300, 300, 50, 50].flatMap((delay, index) => [
    `### Task ${index + 1}: feat(app): step ${index + 1}`,
    `Depends on: none | Files: \`src/app.js\` | Data: none | Proof: ${proof(delay)}`,
    ''
  ]);
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': ['## Plan basis', '', 'Repository: .', 'Branch: main', '', ...tasks].join('\n'),
    'check.js': CLEAN_CHECK
  });
  for (let number = 1; number <= 5; number += 1) landTask(root, number);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 5), ['PASS Task 1', 'PASS Task 2', 'PASS Task 3', 'PASS Task 4', 'PASS Task 5']);
  const events = (await readFile(logPath, 'utf8')).trim().split('\n');
  let running = 0;
  let peak = 0;
  for (const event of events) {
    running += event === '+' ? 1 : -1;
    peak = Math.max(peak, running);
  }
  assert.equal(peak, 3);
});

async function landedWithRecord(record) {
  const plan = [
    '## Plan basis', '', 'Repository: .', 'Branch: main', 'Land gate: node check.js', '',
    '### Task 1: feat(app): greet',
    'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"',
    ''
  ].join('\n');
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n', 'plan.md': plan, 'check.js': FAILING_CHECK, '.gitignore': '.exo/\n' });
  landTask(root, 1);
  if (record !== null) {
    const tree = git(root, 'rev-parse', 'HEAD^{tree}');
    await mkdir(path.join(root, '.exo'), { recursive: true });
    await writeFile(path.join(root, '.exo/land-gate-plan.json'), JSON.stringify({ tree: record.tree ?? tree, gate: 'node check.js', proofs: ['node -e "process.exit(1)"'] }));
  }
  return root;
}

test('a land-gate record for the same tree skips the gate and the passed Proof', async () => {
  const root = await landedWithRecord({});
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines[0].startsWith('SKIP Task 1'), result.stdout);
  assert.ok(lines[1].startsWith('SKIP success-criterion'), result.stdout);
});

test('a land-gate record for another tree reruns the gate and the Proof', async () => {
  const root = await landedWithRecord({ tree: 'deadbeef' });
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 2), ['FAIL Task 1', 'FAIL success-criterion']);
});

test('no land-gate record reruns the gate and the Proof', async () => {
  const root = await landedWithRecord(null);
  const result = await run(SCRIPT, ['--plan', 'plan.md'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n').slice(0, 2), ['FAIL Task 1', 'FAIL success-criterion']);
});
