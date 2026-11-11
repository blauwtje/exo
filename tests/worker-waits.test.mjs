import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUARD_RULES, briefLines, denyReason } from '../lib/guard-rules.mjs';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { readFileSync } from 'node:fs';

const bash = (command, agentType) => ({ tool_name: 'Bash', tool_input: { command }, agent_id: 'a', agent_type: agentType, cwd: process.cwd() });

test('sleep is refused for every subagent', async () => {
  for (const agent of ['research-worker', 'exo-build', 'general-purpose']) {
    const out = await dispatchBash(bash('sleep 30', agent));
    assert.match(JSON.stringify(out), /sleep/i);
  }
});

test('no agent with Bash gets a wait line, with or without TaskStop', () => {
  for (const tools of [['Bash', 'Read'], ['Bash', 'TaskStop']]) {
    assert.equal(briefLines(tools).some((line) => /end the turn/.test(line)), false);
    assert.equal(briefLines(tools).some((line) => /no background shell|foreground/i.test(line)), false);
  }
});

test('no SubagentStop hook is registered', () => {
  const hooks = readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8');
  assert.doesNotMatch(hooks, /SubagentStop/);
});

test('a watch loop, background or not, is refused with the return-and-let-the-lead-wait text', async () => {
  const watch = ['gh pr checks 1 --wat', 'ch'].join('');
  for (const background of [false, true]) {
    const input = bash(watch, 'general-purpose');
    input.tool_input.run_in_background = background;
    const text = JSON.stringify(await dispatchBash(input));
    assert.match(text, /let the lead wait/);
    assert.doesNotMatch(text, /start the long command in the background/);
  }
});

test('task modes tell a worker to wait for its own shells and TaskStop only a hung one', () => {
  const text = readFileSync(new URL('../lib/agent-modes/task-modes.md', import.meta.url), 'utf8');
  assert.match(text, /use TaskStop only on a shell that hangs/);
  assert.doesNotMatch(text, /use TaskStop on each background shell/);
});
