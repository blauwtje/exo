import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gitStarts } from '../verify/git-trace.mjs';
import { run, tempDir } from './harness.mjs';
import { SCRIPT, editApp, landingCheckout } from './land-task-fixture.mjs';

const WRITES = new Set(['update-index', 'commit', 'commit-tree', 'update-ref', 'add', 'reset']);

function readsOf(starts, wanted) {
  const text = (start) => start.argv.slice(1).filter((word, index, all) => word !== '-C' && all[index - 1] !== '-C').join(' ');
  let streak = 0;
  let most = 0;
  for (const start of starts) {
    const line = text(start);
    if (WRITES.has(line.split(' ')[0])) streak = 0;
    else if (line.startsWith(wanted)) most = Math.max(most, ++streak);
  }
  return most;
}

test('a landing reads the staged deletions and the toplevel once between git writes', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const traces = tempDir('git-once-');
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { GIT_TRACE2_EVENT: traces } });
  assert.equal(landed.code, 0, landed.stderr + landed.stdout);
  const starts = gitStarts(traces);
  assert.ok(readsOf(starts, 'diff --cached --name-only --no-renames --diff-filter=D') <= 1);
  assert.ok(readsOf(starts, 'rev-parse --show-toplevel') <= 1);
  const planLogs = starts.filter(({ argv }) => argv.includes('log') && argv.includes('--grep=^Plan-task: '));
  assert.equal(planLogs.length, 2);
});
