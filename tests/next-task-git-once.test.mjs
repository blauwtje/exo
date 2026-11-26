import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { gitStarts } from '../verify/git-trace.mjs';
import { git, run, tempDir } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;

const startsOf = (starts, wanted) => starts.filter(({ argv }) => argv.slice(1).filter((word, index, all) => word !== '-C' && all[index - 1] !== '-C').join(' ').startsWith(wanted)).length;

test('next-task on a fully landed plan reads the plan log and the branch name once', async () => {
  const { root } = await landingCheckout();
  git(root, 'checkout', '-q', '-b', 'topic');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  git(root, 'commit', '-q', '-am', 'feat(app): greet\n\nPlan-task: fixture/1');
  await fs.writeFile(path.join(root, 'src/note.md'), 'note\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat(app): two files\n\nPlan-task: fixture/4');
  const traces = tempDir('next-task-git-once-');
  const result = await run(NEXT_TASK, ['--plan', 'docs/plans/fixture.md', '--root', root], { cwd: root, env: { GIT_TRACE2_EVENT: traces } });
  assert.equal(result.code, 0, result.stderr);
  const starts = gitStarts(traces);
  assert.equal(startsOf(starts, 'log --grep=^Plan-task: '), 1);
  assert.equal(startsOf(starts, 'symbolic-ref -q --short HEAD'), 1);
});
