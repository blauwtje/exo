// The flow fixture's hidden check: it fails a branch with no helper code or a
// missing branch, passes the plan's reference code, and names the helper whose
// edge case is wrong.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkFlow } from '../benchmarks/flow-check.mjs';
import { FLOW_BRANCH, FLOW_HELPERS, prepareFlowRepository } from '../benchmarks/sweep-fixtures.mjs';
import { commitFiles, fixture, git } from './harness.mjs';

async function flowRepository() {
  const root = await fs.realpath(await fixture());
  const repository = path.join(root, 'repo');
  await fs.mkdir(repository);
  prepareFlowRepository(repository, path.join(root, 'origin.git'), true);
  return repository;
}

function referenceFiles(change = (code) => code) {
  const files = {};
  for (const helper of FLOW_HELPERS) {
    files[helper.module] = `${change(helper.code.join('\n'), helper)}\n`;
    files[helper.test] = `${helper.testCode.join('\n')}\n`;
  }
  return files;
}

test('a repository without the branch fails with a missing branch', async () => {
  const result = checkFlow(await flowRepository());
  assert.deepEqual(result, { total: 4, landed: 0, pass: false, defects: ['branch missing'] });
});

test('a branch with no helper code lands nothing and fails', async () => {
  const repository = await flowRepository();
  git(repository, 'checkout', '-b', FLOW_BRANCH);
  git(repository, 'commit', '--allow-empty', '-m', 'chore: start');
  const result = checkFlow(repository);
  assert.equal(result.pass, false);
  assert.equal(result.landed, 0);
  assert.equal(result.defects.length, 4);
});

test('the plan reference code on the branch passes every hidden test', async () => {
  const repository = await flowRepository();
  git(repository, 'checkout', '-b', FLOW_BRANCH);
  await commitFiles(repository, referenceFiles(), 'feat: add the helpers');
  git(repository, 'checkout', 'main');
  const before = git(repository, 'status', '--porcelain');
  const result = checkFlow(repository);
  assert.deepEqual(result, { total: 4, landed: 4, pass: true, defects: [] });
  assert.equal(git(repository, 'branch', '--show-current'), 'main');
  assert.equal(git(repository, 'status', '--porcelain'), before);
});

test('an edge-case bug in one helper fails with that test named', async () => {
  const repository = await flowRepository();
  git(repository, 'checkout', '-b', FLOW_BRANCH);
  const buggy = referenceFiles((code, helper) => helper.module === 'src/slugify.js'
    ? code.replace('a-z0-9', 'a-z')
    : code);
  await commitFiles(repository, buggy, 'feat: add the helpers');
  const result = checkFlow(repository);
  assert.equal(result.pass, false);
  assert.equal(result.landed, 4);
  assert.deepEqual(result.defects, ['slugify keeps digits']);
});

test('a module that exports the wrong name is not landed', async () => {
  const repository = await flowRepository();
  git(repository, 'checkout', '-b', FLOW_BRANCH);
  const renamed = referenceFiles((code, helper) => helper.module === 'src/initials.js'
    ? code.replace('function initials', 'function getInitials')
    : code);
  await commitFiles(repository, renamed, 'feat: add the helpers');
  const result = checkFlow(repository);
  assert.equal(result.pass, false);
  assert.equal(result.landed, 3);
  assert.deepEqual(result.defects, ['initials not landed']);
});
