// The suite guard refuses a whole-suite test run from a build, fix or review
// subagent when its last recorded run took longer than the threshold, and lets
// every other caller, a narrowed run, an unrecorded run and a threshold of 0 pass.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-bash.mjs', import.meta.url));

// The deny reason the Bash dispatcher gives `command` from `agentType`, or null.
async function reason(command, { agentType, seconds, threshold, guards } = {}) {
  const directory = await fixture();
  const cache = path.join(directory, 'cache');
  await fs.mkdir(cache, { recursive: true });
  const durations = seconds === undefined ? {} : { [directory]: { 'npm test': { seconds, lastUsed: new Date().toISOString() } } };
  await fs.writeFile(path.join(cache, 'runtimes.json'), JSON.stringify({ learned: {}, durations, starts: {} }));
  const settings = {};
  if (threshold !== undefined) settings.subagent_suite_after_seconds = threshold;
  if (guards !== undefined) settings.guards = guards;
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), JSON.stringify(settings));
  const hookInput = { tool_name: 'Bash', session_id: 's', cwd: directory, tool_input: { command } };
  if (agentType !== undefined) hookInput.agent_type = agentType;
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify(hookInput),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, EXO_HEAVY_CACHE: cache }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  return hookSpecificOutput.permissionDecision === 'deny' ? hookSpecificOutput.permissionDecisionReason : null;
}

test('a slow whole-suite run is refused from build, fix and review subagents', async () => {
  for (const agentType of ['exo:build-task', 'exo:fix-review', 'exo:review-branch-deep']) {
    const text = await reason('npm test', { agentType, seconds: 33 });
    assert.equal(
      text,
      `exo: ${agentType} may not run the whole test suite here: its last run in this project took 33 s, over subagent_suite_after_seconds (20 s). Run the task's Proof: command or one test file instead; verify runs the suite in the main session.`
    );
  }
});

test('the refusal reaches a whole-suite run in a chain and in a bash -c string', async () => {
  assert.match(await reason('cd app && npm run test > .exo/log', { agentType: 'exo:build-task', seconds: 33 }), /whole test suite/);
  assert.match(await reason('bash -c "npm test"', { agentType: 'exo:build-task', seconds: 33 }), /whole test suite/);
});

test('a fast whole-suite run passes', async () => {
  assert.equal(await reason('npm test', { agentType: 'exo:build-task', seconds: 5 }), null);
});

test('the same slow run passes from the main session and from other agents', async () => {
  assert.equal(await reason('npm test', { seconds: 33 }), null);
  assert.equal(await reason('npm test', { agentType: 'exo:verify', seconds: 33 }), null);
});

test('a run narrowed to one test file passes from a subagent', async () => {
  assert.equal(await reason('npm test -- tests/tax.test.ts', { agentType: 'exo:build-task', seconds: 33 }), null);
});

test('a whole-suite run with no recorded duration passes', async () => {
  assert.equal(await reason('npm test', { agentType: 'exo:build-task' }), null);
});

test('a threshold of 0 and the guards setting off pass any run', async () => {
  assert.equal(await reason('npm test', { agentType: 'exo:build-task', seconds: 33, threshold: 0 }), null);
  assert.equal(await reason('npm test', { agentType: 'exo:build-task', seconds: 33, guards: 'off' }), null);
});
