// A task session over the context hard limit ends on `Task <n>: HANDOFF` after
// writing .exo/handoff-task-<n>.md; the run continues the task in a fresh
// session that is told to read that file, and the hand-off is no stall.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../skills/build/scripts/run-plan.mjs';
import { run } from './harness.mjs';
import { setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const land = (number) => ({ commits: [{ file: number === 1 ? 'a.txt' : 'b.txt', trailers: [`Plan-task: plan/${number}`] }] });
const handoff = (number = 1) => ({ edits: [`.exo/handoff-task-${number}.md`], result: `Hand-off written.\nTask ${number}: HANDOFF` });

async function runPlan(context, steps) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  const seen = path.join(context.tools, 'handoff-env.log');
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(wrapper, `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(seen)}, (process.env.EXO_RUN_HANDOFF ?? '') + '\\n');\nawait import(${JSON.stringify(context.stub)});\n`);
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', wrapper, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home }
  });
  const calls = (await fs.readFile(record, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const handoffEnv = (await fs.readFile(seen, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const detail = result.stdout.match(/^Details: (.+)$/m)?.[1];
  const lines = (detail === undefined ? result.stdout : await fs.readFile(detail, 'utf8')).trim().split('\n');
  return { ...result, calls, handoffEnv, stop: lines.at(-1), lines };
}

test('childEnv hands a task session its hand-off path and no other session one', () => {
  const provider = { name: 'claude', effort: 'high', env: {} };
  assert.equal(childEnv('plan/1', provider, '/r/.exo/handoff-task-1.md').EXO_RUN_HANDOFF, '/r/.exo/handoff-task-1.md');
  process.env.EXO_RUN_HANDOFF = 'inherited';
  try {
    assert.equal(childEnv('plan/1', provider).EXO_RUN_HANDOFF, undefined);
    assert.equal(childEnv(null, provider).EXO_RUN_HANDOFF, undefined);
  } finally {
    delete process.env.EXO_RUN_HANDOFF;
  }
});

test('a HANDOFF last line does not stop the run: the next session reads the hand-off and lands the task', async () => {
  const context = await setup();
  const result = await runPlan(context, [handoff(), land(1), land(2), { result: 'Verify done.' }]);
  assert.doesNotMatch(result.lines.join('\n'), /blocked|no progress/i, result.stdout + result.stderr);
  assert.equal(result.handoffEnv[0], path.join(context.root, '.exo', 'handoff-task-1.md'));
  assert.doesNotMatch(result.calls[0].stdin, /handoff-task-1\.md/);
  assert.ok(result.calls[1].stdin.includes(path.join(context.root, '.exo', 'handoff-task-1.md')), result.calls[1].stdin);
});

test('hand-offs are no stall: two in a row, the stall limit, still reach the landing', async () => {
  const context = await setup();
  const result = await runPlan(context, [handoff(), handoff(), land(1), land(2), { result: 'Verify done.' }]);
  assert.doesNotMatch(result.lines.join('\n'), /no progress/i, result.stdout + result.stderr);
  assert.ok(result.calls.length >= 4, `${result.calls.length} sessions`);
});

test('a HANDOFF line without the file is a failed attempt, not a hand-off', async () => {
  const context = await setup();
  const result = await runPlan(context, [{ result: 'Task 1: HANDOFF' }, { result: 'Task 1: HANDOFF' }]);
  assert.match(result.stop, /no progress on task 1 in 2 iterations/);
});
