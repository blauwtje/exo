import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture, git } from './harness.mjs';
import { setup, runPlan } from './run-plan-fixture.mjs';

test('a run whose tasks all landed before it shows landed and total of the plan', async () => {
  const context = await setup();
  for (const [number, file, subject] of [[1, 'a.txt', 'feat(a): add a'], [2, 'b.txt', 'feat(b): add b']]) {
    await fs.writeFile(path.join(context.root, file), `${number}\n`);
    git(context.root, 'add', file);
    git(context.root, 'commit', '-q', '-m', subject, '-m', `Plan-task: plan/${number}`);
  }
  const dir = path.join(await fs.realpath(await fixture()), '.exo', 'run', 'id');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ id: 'id', phase: 'starting' }));
  context.env = { EXO_RUN_DIR: dir };
  await runPlan(context, [{ result: 'Verify done.' }]);
  const state = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.landed, 2);
  assert.equal(state.total, 2);
});

test('progress: a capped run flips no task and writes no RUN COMPLETE', async () => {
  const context = await setup();
  const result = await runPlan(context, [{}], ['--max-iterations', '1']);
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const tasks = JSON.parse(await fs.readFile(path.join(logDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map((task) => task.passes), [false, false]);
  assert.doesNotMatch(await fs.readFile(path.join(logDir, 'progress.md'), 'utf8'), /RUN COMPLETE/);
});
