import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { landingCheckout, reportFile } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;
const RELATIVE_PLAN = 'docs/plans/fixture.md';

async function landedFixture() {
  const { root } = await landingCheckout();
  git(root, 'checkout', '-q', '-b', 'topic');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  await fs.writeFile(path.join(root, 'src/note.md'), 'note\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): two files\n\nPlan-task: fixture/4');
  return root;
}

const setReport = (root, number, text) => fsSync.writeFileSync(reportFile(root, 'fixture', number), text);

test('Next: none prints the diff stat, the Plan-task commits and the Noticed lines of the plan', async () => {
  const root = await landedFixture();
  setReport(root, 1, 'Landed: x\nNoticed: the helper at src/app.js:1 is dead\n');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /^Diff stat:\n src\/app\.js\s+\|.*\n\s*src\/note\.md\s+\|/m);
  assert.match(out, /^Plan-task commits:\n[0-9a-f]{7} feat\(app\): greet\n[0-9a-f]{7} feat\(app\): two files\n/m);
  assert.match(out, /^Noticed:\nTask 1: Noticed: the helper at src\/app\.js:1 is dead\n$/m);
  assert.doesNotMatch(out, /Task 4:/);
});

test('Next: none prints Noticed: none when no kept report has a Noticed line', async () => {
  const root = await landedFixture();
  setReport(root, 1, 'Landed: x\nNoticed: none\n');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Noticed: none$/m);
});

test('Next: none prints Diff stat: base unknown when the Plan-task commits sit on the default branch', async () => {
  const { root } = await landingCheckout();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): two files\n\nPlan-task: fixture/4');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Diff stat: base unknown$/m);
});
