import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkGitWhitespace } from '../verify/checks/git-whitespace.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { commitFiles, git, gitRepository } from './harness.mjs';

async function branchFixture() {
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  const bare = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'whitespace-origin-')), 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

const counts = (root) => {
  const report = createReport();
  checkGitWhitespace(report, createRepository(root));
  return report.counts();
};

test('a clean branch passes', async () => {
  const root = await branchFixture();
  await commitFiles(root, { 'src/app.js': 'export const a = 2;\n' }, 'feat: change');
  assert.equal(counts(root).FAIL, 0);
});

test('a committed trailing space on the branch fails', async () => {
  const root = await branchFixture();
  await commitFiles(root, { 'src/app.js': 'export const a = 2; \n' }, 'feat: change');
  assert.equal(counts(root).FAIL, 1);
});

test('a staged trailing space fails', async () => {
  const root = await branchFixture();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export const a = 2; \n');
  git(root, 'add', '.');
  assert.equal(counts(root).FAIL, 1);
});

test('an untracked file with a trailing space fails', async () => {
  const root = await branchFixture();
  await fs.writeFile(path.join(root, 'new.md'), 'text \n');
  assert.equal(counts(root).FAIL, 1);
});

test('a repository with no origin falls back to the working tree diff', async () => {
  const root = await gitRepository({ 'src/app.js': 'export const a = 1;\n' });
  await fs.writeFile(path.join(root, 'src/app.js'), 'export const a = 2; \n');
  assert.equal(counts(root).FAIL, 1);
});
