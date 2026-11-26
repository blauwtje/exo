import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { landingCheckout, reportFile } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;
const RELATIVE_PLAN = 'docs/plans/fixture.md';

test('Next: none reads the Noticed lines of this plan only, not of another plan id with the same task number', async () => {
  const { root } = await landingCheckout();
  const other = reportFile(root, 'other-plan', 1);
  fs.writeFileSync(other, 'Landed: x\nNoticed: a line of another plan (src/app.js:1)\n');
  fs.writeFileSync(reportFile(root, 'fixture', 1), 'Landed: x\nNoticed: none\n');
  git(root, 'checkout', '-q', '-b', 'topic');
  fs.writeFileSync(`${root}/src/app.js`, 'export function greet() {\n  return "hello";\n}\n');
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  fs.writeFileSync(`${root}/src/note.md`, 'note\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): two files\n\nPlan-task: fixture/4');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Task 1:|another plan/);
});

test('a dispatch of a task removes a report already at its keyed path', async () => {
  const { root } = await landingCheckout();
  const report = reportFile(root, 'fixture', 1);
  fs.writeFileSync(report, 'Landed: stale\n');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^Report: ${report.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.equal(fs.existsSync(report), false);
});

test('a second run before the land keeps the report the builder wrote for the printed task', async () => {
  const { root } = await landingCheckout();
  const report = reportFile(root, 'fixture', 1);
  const first = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(first.code, 0, first.stderr);
  fs.writeFileSync(report, 'Landed: x\nNoticed: none\n');
  const second = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(fs.existsSync(report), true);
});
