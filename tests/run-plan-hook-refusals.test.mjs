import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseStream } from '../skills/build/scripts/run-session.mjs';
import { run } from './harness.mjs';
import { land, setup } from './run-plan-fixture.mjs';

const RUNNER = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const PLUGIN_ROOT = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const denial = (id, command) => ({ tool_name: 'Bash', tool_use_id: id, tool_input: { command } });
const call = (id, command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } });
const ruleEvent = (id) => ({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_use_id: id, decision_reason_type: 'mode' });
const stream = (events) => events.map((event) => JSON.stringify(event)).join('\n');
const denials = [denial('hook', 'cat > a.test.mjs'), denial('rule', 'npm install left-pad')];
const before = [call('hook', 'cat > a.test.mjs'), call('rule', 'npm install left-pad'), ruleEvent('rule')];
const result = { type: 'result', num_turns: 1, total_cost_usd: 0, permission_denials: denials, result: 'x' };

test('parseStream keeps a denial named by a permission_denied event and sets a hook refusal apart', () => {
  const parsed = parseStream(stream([...before, result]));
  assert.deepEqual(parsed.denials.map((entry) => entry.tool_use_id), ['rule']);
  assert.deepEqual(parsed.refusals.map((entry) => entry.tool_use_id), ['hook']);
});

async function runPlan(context, steps, extra = []) {
  const scenario = path.join(context.tools, 'scenario.json');
  const wrapper = path.join(context.tools, 'wrapper.mjs');
  await fs.writeFile(scenario, JSON.stringify({ pluginPath: PLUGIN_ROOT, planPath: context.plan, steps }));
  const emits = [...extra, ...before].map((event) => `process.stdout.write(${JSON.stringify(`${JSON.stringify(event)}\n`)});`);
  await fs.writeFile(wrapper, `${emits.join('\n')}\nawait import(${JSON.stringify(context.stub)});\n`);
  const outcome = await run(RUNNER, [context.plan, '--root', context.root, '--claude', wrapper, '--session', 'task'], {
    cwd: context.root,
    env: { STUB_SCENARIO: scenario, STUB_RECORD: path.join(context.tools, 'calls.jsonl'), CLAUDECODE: '1', HOME: context.home }
  });
  return fs.readFile(outcome.stdout.match(/^Details: (.+)$/m)[1], 'utf8');
}

test('the report gives a session its cache read share and warns on a large turn-1 write', async () => {
  const usage = { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 30000, cache_creation_input_tokens: 25000, output_tokens: 5 }, content: [] } };
  const detail = await runPlan(await setup(), [{ denials: [] }], [usage]);
  assert.match(detail, /^Task 1: cache read 55% \(30k read, 25k written\)$/m, detail);
  assert.match(detail, /^Task 1: warning: turn 1 wrote 25k tokens to the cache, over the 20k bar$/m, detail);
  const ledger = await fs.readFile(path.join(detail.match(/^Logs: (.+)$/m)[1], 'sessions.jsonl'), 'utf8');
  assert.match(ledger, /"cacheRead":30000,"cacheWrite":25000,"firstCacheWrite":25000/, ledger);
});

test('the report gives each review session its cache read share and turn-1 warning too', async () => {
  const usage = { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 30000, cache_creation_input_tokens: 25000, output_tokens: 5 }, content: [] } };
  const detail = await runPlan(await setup({ risk: 'security boundary' }), [land(1), land(2), { result: 'verdict=CLEAN defect=0 concern=0 question=0 fix=0 report=x' }], [usage]);
  assert.match(detail, /^Iteration \d+ review: cache read 55% \(30k read, 25k written\)$/m, detail);
  assert.match(detail, /^Iteration \d+ review: warning: turn 1 wrote 25k tokens to the cache, over the 20k bar$/m, detail);
});

test('the report lists a permission-rule denial under Denied and a hook refusal apart without Allow advice', async () => {
  const detail = await runPlan(await setup(), [{ denials }, { denials: [] }]);
  assert.match(detail, /^Denied: 1 command /m);
  assert.match(detail, /^  iteration 1, task 1: npm install left-pad$/m);
  const hookHeader = detail.match(/^.*refused by hooks.*$/im)?.[0];
  assert.ok(hookHeader, detail);
  assert.doesNotMatch(hookHeader, /Allow:/);
  const hookLine = /^  iteration 1, task 1: cat > a\.test\.mjs$/gm;
  assert.equal(detail.match(hookLine)?.length, 1, detail);
  assert.ok(detail.indexOf('Denied: ') < detail.indexOf('npm install left-pad'));
  assert.ok(detail.indexOf('npm install left-pad') < detail.indexOf(hookHeader));
  assert.ok(detail.indexOf(hookHeader) < detail.search(hookLine));
});
