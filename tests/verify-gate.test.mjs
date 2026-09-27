// verify.mjs runs each landed task's Proof command, the plan's success
// criterion and a stray-path check, then prints the REVIEWER line
// pick-reviewer.mjs's size facts pick.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findStrayPaths, parseTasks, successCriterionPasses } from '../skills/verify/scripts/verify.mjs';
import { gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

const PLAN = `### Task 1: feat(app): greet
Depends on: none | Files: \`src/app.js\` | Data: none | Proof: node -e "process.exit(0)"

### Task 2: feat(app): fail
Depends on: 1 | Files: \`src/broken.js\` | Data: none | Proof: node -e "process.exit(1)"
`;

test('parseTasks reads the number, Files and Proof off each task heading', () => {
  const tasks = parseTasks(PLAN);
  assert.deepEqual(tasks, [
    { number: 1, files: ['src/app.js'], proof: 'node -e "process.exit(0)"' },
    { number: 2, files: ['src/broken.js'], proof: 'node -e "process.exit(1)"' }
  ]);
});

test('findStrayPaths keeps only paths no task declared', () => {
  const tasks = parseTasks(PLAN);
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/extra.js']), ['src/extra.js']);
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/broken.js']), []);
});

test('successCriterionPasses reads the clean SUMMARY line', () => {
  assert.equal(successCriterionPasses('SUMMARY FAIL=0 WARN=0 UNRUN=0\n'), true);
  assert.equal(successCriterionPasses('SUMMARY FAIL=1 WARN=0 UNRUN=0\n'), false);
  assert.equal(successCriterionPasses(''), false);
});

const CLEAN_CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";
const DIRTY_CHECK = "console.log('SUMMARY FAIL=1 WARN=0 UNRUN=0');\n";

test('a passing task, a clean check and no stray paths print PASS lines and REVIEWER: sonnet', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'PASS success-criterion', 'PASS stray-paths', 'REVIEWER: sonnet']);
});

test('a failing task Proof prints FAIL and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): break\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(1)"\n',
    'check.js': CLEAN_CHECK
  });

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim().split('\n')[0], 'FAIL Task 1');
});

test('an unclean check-command SUMMARY prints FAIL success-criterion', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': DIRTY_CHECK
  });

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.deepEqual(result.stdout.trim().split('\n'), ['PASS Task 1', 'FAIL success-criterion', 'PASS stray-paths', 'REVIEWER: sonnet']);
});

test('a change outside every declared Files prints a STRAY line and exits 1', async () => {
  const root = await gitRepository({
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': '### Task 1: feat(app): greet\nDepends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"\n',
    'check.js': CLEAN_CHECK
  });
  await fs.writeFile(path.join(root, 'src', 'extra.js'), 'export const stray = 1;\n');

  const result = await run(SCRIPT, ['--plan', 'plan.md', '--check-command', 'node check.js'], { cwd: root });
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes('STRAY src/extra.js'));
});

test('missing --plan is rejected', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const greet = () => "hi";\n' });
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--plan/);
});
