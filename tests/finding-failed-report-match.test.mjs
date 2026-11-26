import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { run } from './harness.mjs';
import { landingCheckout, reportFile } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;
const RELATIVE_PLAN = 'docs/plans/fixture.md';

test('a finished report whose Noticed line mentions BLOCKED stays at the Report path on a re-dispatch', async () => {
  const { root } = await landingCheckout();
  const report = reportFile(root, 'fixture', 1);
  const first = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(first.code, 0, first.stderr);
  const finished = 'Landed: x\nNoticed: the word BLOCKED appears in docs/notes.md:3\nUnresolved: none\nTask 1: GREEN\n';
  fs.writeFileSync(report, finished);
  const second = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(fs.readFileSync(report, 'utf8'), finished);
});
