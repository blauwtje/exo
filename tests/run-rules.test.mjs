// Two task briefs of one plan repeat no fixed line: the rules every task
// shares sit once in the run rules file, and each brief only names it.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { runRules, nextTaskReport } from '../skills/build/scripts/next-task.mjs';
import { scratchPath } from '#scratch-path';
import { briefFixture, compactTask, git, gitRepository } from './harness.mjs';

test('two briefs of one plan share only the Rules: line', async () => {
  const planText = briefFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(a): add a', files: ['src/a.js'], proof: 'node --test a' }),
    compactTask({ number: 2, title: 'feat(b): add b', files: ['src/b.js'], proof: 'node --test b' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': planText });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const rulesPath = scratchPath(root, 'run-rules.md');
  await fs.mkdir(path.dirname(rulesPath), { recursive: true });
  await fs.writeFile(rulesPath, 'rules\n');
  const briefOf = (number) => path.join(root, '.exo', 'briefs', `task-${number}.md`);
  nextTaskReport({ planPath, planText, root });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(a): add a', '-m', 'Plan-task: 1');
  nextTaskReport({ planPath, planText, root });
  const briefs = [briefOf(1), briefOf(2)];
  const lines = async (file) => new Set((await fs.readFile(file, 'utf8')).split('\n').filter((line) => line.trim() !== ''));
  const [first, second] = await Promise.all(briefs.map(lines));
  // The "The task section:" heading is brief structure, not a rule.
  const shared = [...first].filter((line) => second.has(line) && line !== 'The task section:');
  assert.deepEqual(shared, [`Rules: ${rulesPath}`]);
  assert.equal(typeof runRules, 'function');
});
