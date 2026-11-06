import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { briefFixture, git, gitRepository, taskSection } from './harness.mjs';

const script = path.resolve('skills/start/scripts/board.mjs');

const task = (number, title) => taskSection({ number, title, files: [`- Create: \`f${number}.txt\``], subject: title });

function board(root) {
  const answer = spawnSync('node', [script, '--cwd', root], { encoding: 'utf8' });
  assert.equal(answer.status, 0, answer.stderr);
  return answer.stdout.trim();
}

async function repositoryWithPlan() {
  const plan = briefFixture({ tasks: [task(1, 'feat(x): one'), task(2, 'feat(x): two')] });
  return gitRepository({ 'docs/plans/demo.md': plan });
}

test('a repository with nothing open prints Nothing open.', async () => {
  const root = await gitRepository({ 'README.md': 'x\n' });
  assert.equal(board(root), 'Nothing open.');
});

test('a plan with a landed task, a parked run, an unmerged branch and a handoff print one board and the next action', async () => {
  const root = await repositoryWithPlan();
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(x): one', '-m', 'Plan-task: 1');
  git(root, 'checkout', '-q', '-b', 'side');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'chore: side work');
  git(root, 'checkout', '-q', 'main');
  const runDir = path.join(root, '.exo', 'run', '20260101T000000-ab12');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({ id: '20260101T000000-ab12', plan: path.join(root, 'docs/plans/demo.md'), phase: 'parked', startedAt: '2026-01-01T00:00:00.000Z', landed: 1, total: 2 }));
  const handoff = path.join(root, '.git', 'exo', 'handoff', 'main.md');
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, 'Task 2 is half done.\n');
  const lines = board(root).split('\n');
  assert.deepEqual(lines, [
    'Open in this repository:',
    '- run 20260101T000000-ab12 is parked on demo.md, 1 of 2 tasks landed',
    `- saved session at ${handoff}: Task 2 is half done.`,
    '- plan docs/plans/demo.md: 1 of 2 tasks landed',
    '- branch side is not merged',
    '',
    'Next: exo approve 20260101T000000-ab12'
  ]);
});

test('a brief with an open point is listed and sent back to spec', async () => {
  const brief = briefFixture({ tasks: [task(1, 'feat(x): one')] }).replace('## Plan basis', '## Open points\n- Which badge tone?\n\n## Plan basis');
  const root = await gitRepository({ 'docs/specs/idea.md': brief });
  assert.equal(board(root), [
    'Open in this repository:',
    '- brief docs/specs/idea.md has 1 open point',
    '',
    'Next: /exo:spec docs/specs/idea.md to answer its open points'
  ].join('\n'));
});
