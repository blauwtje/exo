import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBoundaryRows } from '../verify/checks/boundary-rows.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { commitFiles, git as gitIn, gitRepository, tempDir } from './harness.mjs';

const PLAN = [
  '# Plan', '', '### Task 1: guard the path', '',
  'Depends on: none | Files: `src/guard.mjs`, `tests/guard.test.mjs` | Risk: security boundary | Boundary: in a/b | out ../x | test tests/guard.test.mjs | Proof: node --test tests/guard.test.mjs', ''
].join('\n');

function repo(files) {
  const root = tempDir('exo-boundary-rows-');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

function boundaryRows(root) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkBoundaryRows(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines[0];
}

test('a Boundary test file with an out-of-scope test title passes', () => {
  const root = repo({ 'docs/specs/p.md': PLAN, 'tests/guard.test.mjs': "test('rejects an out-of-scope path', () => {});\n" });
  assert.match(boundaryRows(root), /^\[PASS\] boundary rows: /);
});

test('a Boundary test file without an out-of-scope title fails and names the file', () => {
  const root = repo({ 'docs/specs/p.md': PLAN, 'tests/guard.test.mjs': "test('rejects a path', () => {});\n// out-of-scope\n" });
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 1: tests\/guard\.test\.mjs holds no test/);
});

test('a Boundary test file not on disk, or no specs folder, passes', () => {
  assert.match(boundaryRows(repo({ 'docs/specs/p.md': PLAN })), /^\[PASS\] boundary rows: /);
  assert.match(boundaryRows(repo({})), /^\[PASS\] boundary rows: /);
});

test('a spec that does not parse fails and names the spec', () => {
  const root = repo({ 'docs/specs/broken.md': '### Task 1: x\n\nDepends on: soon\n' });
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: broken\.md does not parse: /);
});

test('a git-ignored spec never counts, a tracked one does', () => {
  const root = repo({ '.gitignore': 'docs/*\n', 'docs/specs/p.md': PLAN, 'tests/guard.test.mjs': "test('rejects a path', () => {});\n" });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '--quiet');
  git('add', '--all');
  assert.match(boundaryRows(root), /^\[PASS\] boundary rows: /);
  git('add', '--force', 'docs/specs/p.md');
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 1: /);
});

const TWO_TASK_PLAN = [
  PLAN,
  '### Task 2: guard the url', '',
  'Depends on: 1 | Files: `src/url.mjs`, `tests/url.test.mjs` | Risk: security boundary | Boundary: in a/b | out ../x | test tests/url.test.mjs | Proof: node --test tests/url.test.mjs', ''
].join('\n');

async function branchWithPlan() {
  const root = await gitRepository({ 'tests/url.test.mjs': "test('reads a url', () => {});\n" });
  gitIn(root, 'checkout', '-q', '-b', 'feature');
  await commitFiles(root, { 'docs/specs/p.md': TWO_TASK_PLAN }, 'docs(spec): add the plan');
  return root;
}

test('an unlanded task of a plan in progress is not enforced, a landed one is', async () => {
  const root = await branchWithPlan();
  assert.match(boundaryRows(root), /^\[PASS\] boundary rows: /);
  await commitFiles(root, { 'tests/guard.test.mjs': "test('rejects a path', () => {});\n" }, 'guard the path\n\nPlan-task: p/1');
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 1: tests\/guard\.test\.mjs/);
});

test('a plan already on the default branch is enforced without its trailers', async () => {
  const root = await branchWithPlan();
  gitIn(root, 'checkout', '-q', 'main');
  gitIn(root, 'merge', '-q', '--squash', 'feature');
  gitIn(root, 'commit', '-q', '-m', 'feat: land the plan');
  gitIn(root, 'checkout', '-q', '-b', 'next');
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 2: tests\/url\.test\.mjs/);
});

test('the real repository passes', () => {
  assert.match(boundaryRows(fileURLToPath(new URL('..', import.meta.url))), /^\[PASS\] boundary rows: /);
});

test('the candidate task of a land gate is enforced at its own gate', async () => {
  const root = await branchWithPlan();
  await commitFiles(root, { 'tests/guard.test.mjs': "test('rejects a path', () => {});\n" }, 'guard the path\n\nPlan-candidate: p/1');
  assert.match(boundaryRows(root), /^\[FAIL\] boundary rows: p\.md task 1: tests\/guard\.test\.mjs/);
  assert.doesNotMatch(boundaryRows(root), /task 2/);
});
