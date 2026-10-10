// Two task briefs of one plan repeat no fixed line: the rules every task
// shares sit once in the run rules file, and each brief only names it.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { nextTaskReport } from '../skills/build/scripts/next-task.mjs';
import { scratchPath } from '#scratch-path';
import { briefFixture, compactTask, git, gitRepository } from './harness.mjs';

// Each task's own frame bullet sits under a different heading, so neither the
// bullet nor its heading is a line both briefs share.
const A_BULLET = '`src/a.js` keeps its export named `a`.';
const B_BULLET = '`src/b.js` reads its input from `src/b.json`.';

test('two briefs of one plan share only the Rules: line', async () => {
  const planText = briefFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(a): add a', files: ['src/a.js'], proof: 'node --test a' }),
    compactTask({ number: 2, title: 'feat(b): add b', files: ['src/b.js'], proof: 'node --test b' })
  ] }).replace('## Decisions\n', `## Decisions\n- ${A_BULLET}\n`).replace('## Acceptance\n', `## Context\n- ${B_BULLET}\n\n## Acceptance\n`);
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
  assert.ok(first.has(`- ${A_BULLET}`) && !first.has(`- ${B_BULLET}`), 'task 1 carries its own bullet');
  assert.ok(second.has(`- ${B_BULLET}`) && !second.has(`- ${A_BULLET}`), 'task 2 carries its own bullet');
  const shared = [...first].filter((line) => second.has(line));
  assert.deepEqual(shared, [`Rules: read ${rulesPath} first; it holds this run's Goal, Success criterion, report cap and boundaries.`]);
});
