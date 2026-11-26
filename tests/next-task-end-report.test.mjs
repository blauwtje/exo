import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { scratchPath } from '../lib/scratch-path.mjs';
import { git, run } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

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

const setReport = (root, number, text, isoTime) => {
  const report = scratchPath(root, `implementer-${number}.md`);
  fsSync.writeFileSync(report, text);
  const time = new Date(isoTime);
  fsSync.utimesSync(report, time, time);
};

test('Next: none prints the diff stat, the Plan-task commits and the Noticed lines of this run only', async () => {
  const root = await landedFixture();
  setReport(root, 1, 'Landed: x\nNoticed: the helper at src/app.js:1 is dead\n', '2099-01-01T00:00:00Z');
  setReport(root, 4, 'Landed: y\nNoticed: a line of an earlier plan\n', '2000-01-01T00:00:00Z');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /^Diff stat:\nsrc\/app\.js\s+\|.*\n\s*src\/note\.md\s+\|/m);
  assert.match(out, /^Plan-task commits:\n[0-9a-f]{7} feat\(app\): greet\n[0-9a-f]{7} feat\(app\): two files\n/m);
  assert.match(out, /^Noticed:\nTask 1: Noticed: the helper at src\/app\.js:1 is dead\n$/m);
  assert.doesNotMatch(out, /Task 4:|earlier plan/);
});

test('Next: none prints Noticed: none when no kept report has a Noticed line', async () => {
  const root = await landedFixture();
  setReport(root, 1, 'Landed: x\nNoticed: none\n', '2099-01-01T00:00:00Z');
  const result = await run(NEXT_TASK, ['--plan', RELATIVE_PLAN, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Noticed: none$/m);
});
