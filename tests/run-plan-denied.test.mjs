import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRun, runDir as runDirOf } from '../skills/build/scripts/run-state.mjs';
import { run } from './harness.mjs';
import { land, setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const denial = { tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm install left-pad' } };

async function runPlan(context, steps) {
  const scenario = path.join(context.tools, 'scenario.json');
  const record = path.join(context.tools, 'calls.jsonl');
  createRun(context.root, { id: 'denied-test', plan: context.plan });
  const runDir = runDirOf(context.root, 'denied-test');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const result = await run(RUNNER, [context.plan, '--root', context.root, '--claude', context.stub, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: record, CLAUDECODE: '1', HOME: context.home, EXO_RUN_DIR: runDir }
  });
  const denied = await fs.readFile(path.join(runDir, 'denied.txt'), 'utf8').catch(() => null);
  return { ...result, denied };
}

test('a refused command lands in denied.txt in EXO_RUN_DIR', async () => {
  const result = await runPlan(await setup(), [{ ...land(1), denials: [denial] }, land(2), { result: 'Verify done.' }]);
  assert.notEqual(result.denied, null, result.stdout + result.stderr);
  assert.match(result.denied, /^Denied: 1 command /m);
  assert.match(result.denied, /^  iteration 1, task 1: npm install left-pad$/m);
});

test('a run without denials writes no denied.txt', async () => {
  const result = await runPlan(await setup(), [land(1), land(2), { result: 'Verify done.' }]);
  assert.equal(result.denied, null, result.stdout + result.stderr);
});
