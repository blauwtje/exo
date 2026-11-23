import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, gitRepository, run, REPOSITORY_ROOT } from './harness.mjs';

const SCRIPT = path.join(REPOSITORY_ROOT, 'skills/build/scripts/adopt-plan.mjs');
const PLAN = 'docs/specs/topic.md';
const TEXT = '# Plan: topic\n\n## Tasks\n';

const adopt = (plan, root) => run(SCRIPT, ['--plan', plan, '--root', root]);
const lastLine = (stdout) => stdout.trim().split('\n').at(-1);

async function mainWithPlan() {
  const main = await gitRepository({ 'README.md': 'seed\n' });
  await fs.mkdir(path.join(main, 'docs/specs'), { recursive: true });
  await fs.writeFile(path.join(main, PLAN), TEXT);
  return main;
}

test('an untracked plan in main is committed on the sibling worktree branch', async () => {
  const main = await mainWithPlan();
  const tree = `${main}-wt`;
  git(main, 'worktree', 'add', '-q', '-b', 'topic', tree);
  const { code, stdout } = await adopt(path.join(main, PLAN), tree);
  assert.equal(code, 0);
  assert.equal(lastLine(stdout), `Plan: ${path.join(tree, PLAN)}`);
  assert.equal(git(tree, 'show', `topic:${PLAN}`) + '\n', TEXT);
  assert.equal(git(main, 'status', '--porcelain'), '');
  await fs.rm(tree, { recursive: true, force: true });
});

test('an untracked plan in the root is committed on the current branch', async () => {
  const main = await mainWithPlan();
  git(main, 'checkout', '-q', '-b', 'topic');
  const { code, stdout } = await adopt(path.join(main, PLAN), main);
  assert.equal(code, 0);
  assert.equal(lastLine(stdout), `Plan: ${path.join(main, PLAN)}`);
  assert.equal(git(main, 'log', '-1', '--format=%s'), 'docs(spec): add topic.md');
  assert.equal(git(main, 'status', '--porcelain'), '');
});

test('a modified tracked plan moves to the worktree branch and main is restored', async () => {
  const main = await mainWithPlan();
  git(main, 'add', PLAN);
  git(main, 'commit', '-q', '-m', 'add plan');
  const tree = `${main}-wt`;
  git(main, 'worktree', 'add', '-q', '-b', 'topic', tree);
  await fs.appendFile(path.join(main, PLAN), 'more\n');
  const { code } = await adopt(path.join(main, PLAN), tree);
  assert.equal(code, 0);
  assert.equal(git(tree, 'show', `topic:${PLAN}`) + '\n', `${TEXT}more\n`);
  assert.equal(git(main, 'status', '--porcelain'), '');
  await fs.rm(tree, { recursive: true, force: true });
});

test('a staged plan leaves no copy in main', async () => {
  const main = await mainWithPlan();
  const tree = `${main}-wt`;
  git(main, 'worktree', 'add', '-q', '-b', 'topic', tree);
  git(main, 'add', PLAN);
  const { code } = await adopt(path.join(main, PLAN), tree);
  assert.equal(code, 0);
  assert.equal(git(tree, 'show', `topic:${PLAN}`) + '\n', TEXT);
  assert.equal(git(main, 'status', '--porcelain'), '');
  await fs.rm(tree, { recursive: true, force: true });
});
