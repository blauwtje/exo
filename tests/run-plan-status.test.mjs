// run-plan.mjs task status: a capped run leaves every task unflipped in
// tasks.json and writes no RUN COMPLETE to progress.md.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { setup, runPlan } from './run-plan-fixture.mjs';

test('progress: a capped run flips no task and writes no RUN COMPLETE', async () => {
  const context = await setup();
  const result = await runPlan(context, [{}], ['--max-iterations', '1']);
  const logDir = path.dirname(result.stdout.match(/^Details: (.+)$/m)[1]);
  const tasks = JSON.parse(await fs.readFile(path.join(logDir, 'tasks.json'), 'utf8'));
  assert.deepEqual(tasks.map((task) => task.passes), [false, false]);
  assert.doesNotMatch(await fs.readFile(path.join(logDir, 'progress.md'), 'utf8'), /RUN COMPLETE/);
});
