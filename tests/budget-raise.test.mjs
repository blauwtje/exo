import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkBudgetRaises } from '../verify/checks/budget-raises.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { git, gitRepository } from './harness.mjs';

const budgets = (spec, hook) => `export const STAGE_BODY_TOKENS = { 'spec': ${spec}, 'build': 739 };\nexport const HOOK_LINES_LOCK = { lines: ${hook}, measured: '2026-11-05' };\n`;
const RAISE = 'Budget-raise: STAGE_BODY_TOKENS.spec 935 to 955: the new step needs twenty tokens';

async function branchFixture() {
  const root = await gitRepository({ 'verify/budgets.mjs': budgets(935, 1098) });
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

async function commitFile(root, { file, content, message }) {
  await fs.writeFile(path.join(root, file), content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

const commitBudgets = (root, content, message) => commitFile(root, { file: 'verify/budgets.mjs', content, message });
const commitNotes = (root) => commitFile(root, { file: 'notes.md', content: 'x\n', message: 'docs: add notes' });

async function outcome(root) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const report = createReport();
    await checkBudgetRaises(report, createRepository(root));
    return { counts: report.counts(), text: lines.join('\n') };
  } finally {
    console.log = original;
  }
}

test('a raised value without a Budget-raise line fails naming the id', async () => {
  const root = await branchFixture();
  await commitBudgets(root, budgets(955, 1098), 'fix: fit the spec body');
  const result = await outcome(root);
  assert.equal(result.counts.FAIL, 1);
  assert.match(result.text, /STAGE_BODY_TOKENS\.spec raised 935 to 955/);
});

test('a raised value with a matching Budget-raise line passes', async () => {
  const root = await branchFixture();
  await commitBudgets(root, budgets(955, 1098), `fix: fit the spec body\n\n${RAISE}`);
  const result = await outcome(root);
  assert.equal(result.counts.FAIL, 0);
  assert.equal(result.counts.PASS, 1);
});

test('a Budget-raise line in an earlier commit of the range covers the raise', async () => {
  const root = await branchFixture();
  await commitBudgets(root, budgets(955, 1098), `fix: fit the spec body\n\n${RAISE}`);
  await commitNotes(root);
  assert.equal((await outcome(root)).counts.FAIL, 0);
});

test('a lowered value passes', async () => {
  const root = await branchFixture();
  await commitBudgets(root, budgets(900, 1098), 'fix: trim the spec body');
  assert.equal((await outcome(root)).counts.FAIL, 0);
});

test('an unchanged value passes', async () => {
  const root = await branchFixture();
  await commitNotes(root);
  assert.equal((await outcome(root)).counts.FAIL, 0);
});

test('a Budget-raise line with a different new value fails', async () => {
  const root = await branchFixture();
  const line = 'Budget-raise: STAGE_BODY_TOKENS.spec 935 to 950: the new step needs fifteen tokens';
  await commitBudgets(root, budgets(955, 1098), `fix: fit the spec body\n\n${line}`);
  const result = await outcome(root);
  assert.equal(result.counts.FAIL, 1);
  assert.match(result.text, /STAGE_BODY_TOKENS\.spec/);
});

test('a Budget-raise line with a different old value fails', async () => {
  const root = await branchFixture();
  const line = 'Budget-raise: STAGE_BODY_TOKENS.spec 930 to 955: the new step needs twenty-five tokens';
  await commitBudgets(root, budgets(955, 1098), `fix: fit the spec body\n\n${line}`);
  assert.equal((await outcome(root)).counts.FAIL, 1);
});

test('a Budget-raise line for another id fails', async () => {
  const root = await branchFixture();
  const line = 'Budget-raise: HOOK_LINES_LOCK.lines 935 to 955: wrong id';
  await commitBudgets(root, budgets(955, 1098), `fix: fit the spec body\n\n${line}`);
  assert.equal((await outcome(root)).counts.FAIL, 1);
});

test('only the unclaimed raise fails when two values rise', async () => {
  const root = await branchFixture();
  await commitBudgets(root, budgets(955, 1110), `fix: fit both\n\n${RAISE}`);
  const result = await outcome(root);
  assert.equal(result.counts.FAIL, 1);
  assert.match(result.text, /HOOK_LINES_LOCK\.lines raised 1098 to 1110/);
  assert.doesNotMatch(result.text, /STAGE_BODY_TOKENS\.spec raised/);
});

test('main itself with no commits passes even when the file differs', async () => {
  const root = await gitRepository({ 'verify/budgets.mjs': budgets(935, 1098) });
  await fs.writeFile(path.join(root, 'verify/budgets.mjs'), budgets(955, 1098));
  assert.equal((await outcome(root)).counts.FAIL, 0);
});
