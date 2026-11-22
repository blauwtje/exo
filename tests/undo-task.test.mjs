import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { commitFiles, compactPlanFixture, compactTask, git, gitRepository, run } from './harness.mjs';

const SCRIPT = new URL('../skills/build/scripts/undo-task.mjs', import.meta.url).pathname;
const PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): one', files: ['a.js'] }),
  compactTask({ number: 2, title: 'feat(app): two', dependsOn: '1', files: ['b.js'] }),
  compactTask({ number: 3, title: 'feat(app): three', files: ['c.js'] })
] });

async function landed() {
  const root = await gitRepository({ 'docs/plan.md': PLAN });
  await commitFiles(root, { 'a.js': '1\n' }, 'feat(app): one\n\nPlan-task: plan/1');
  const first = git(root, 'rev-parse', 'HEAD');
  await commitFiles(root, { 'b.js': '2\n' }, 'feat(app): two\n\nPlan-task: plan/2');
  const second = git(root, 'rev-parse', 'HEAD');
  return { root, first, second };
}

const undo = (root, number) => run(SCRIPT, ['--plan', 'docs/plan.md', '--root', root, number], { cwd: root });

test('a task and the landed task that depends on it print newest first', async () => {
  const { root, first, second } = await landed();
  const result = await undo(root, '1');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, `git revert --no-commit ${second}\ngit revert --no-commit ${first}\nFix commits carry no Plan-task trailer and are not listed.\n`);
});

test('a task nothing depends on prints only its own commit', async () => {
  const { root, second } = await landed();
  const result = await undo(root, '2');
  assert.equal(result.stdout.split('\n')[0], `git revert --no-commit ${second}`);
  assert.equal(result.stdout.split('\n').length, 3);
});

test('a dirty tree exits 1', async () => {
  const { root } = await landed();
  await fs.writeFile(path.join(root, 'a.js'), 'changed\n');
  const result = await undo(root, '1');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /dirty/);
});

test('an unlanded task exits 1', async () => {
  const { root } = await landed();
  const result = await undo(root, '3');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /task 3 has no Plan-task commit/);
});
