// verify.mjs runs each landed task's Proof command, the plan's own Land
// gate (or npm run check) and a stray-path check, then prints the REVIEWER
// line pick-reviewer.mjs's size facts pick. "Landed" comes from #plan-tasks'
// own landedTasks(), the same read land-task.mjs uses, so a task with no
// `Plan-task: <n>` commit never runs its Proof here either.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findStrayPaths, runnableProof, successCriterionPasses } from '../skills/verify/scripts/verify.mjs';
import { git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

function landTask(root, number) {
  git(root, 'commit', '--allow-empty', '-m', `chore: land task ${number}`, '-m', `Plan-task: ${number}`);
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

const CLEAN_CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";
const FAILING_CHECK = "console.log('check failed'); process.exit(1);\n";

test('a landed task, a clean check and no stray paths print PASS lines and REVIEWER: sonnet', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  landTask(root, 1);

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', 'REVIEWER: sonnet']);
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
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'FAIL success-criterion', 'PASS stray-paths', 'REVIEWER: sonnet']);
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

test("a plan's 'Land gate: none' skips the check", async () => {
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
  assert.ok(result.stdout.includes('PASS success-criterion'));
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
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', 'REVIEWER: sonnet']);
});

test('missing --plan is rejected', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n' });
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--plan/);
});
