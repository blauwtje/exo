import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { agentHook } from '../hooks/agent-effort.mjs';
import { checkResearchOrchestrator } from '../verify/checks/research-orchestrator.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STEP = '5. **Dispatch** one `exo:orchestrator` with `Workers: 4` or fewer, one per sub-question.\n6. **Collect**';
const DEPTH = 'set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 3+ for a launched run, else 2+.';
const ORCHESTRATOR = 'tools: Read, Write, Bash, Agent';
const WORKER = 'tools: Read, Write, Bash, Grep';
const allowAll = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });

function agentFile(tools) {
  return `---\nname: x\n${tools}\n---\n# x\n`;
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function run(root, dispatch) {
  const results = [];
  checkResearchOrchestrator({ assert: (ok, ...texts) => results.push({ ok, detail: ok ? texts[1] : texts[2] }) }, createRepository(root), dispatch);
  return results[0];
}

function outcome({ research = STEP, runLoop = DEPTH, orchestrator = ORCHESTRATOR, worker = WORKER, dispatch = agentHook } = {}) {
  const root = tempDir('research-orchestrator-');
  write(root, 'skills/spec/references/research.md', research);
  write(root, 'skills/build/references/run-loop.md', runLoop);
  write(root, 'agents/orchestrator.md', agentFile(orchestrator));
  write(root, 'agents/research-worker.md', agentFile(worker));
  return run(root, dispatch);
}

test('the shipped repository passes', () => {
  const result = run(ROOT);
  assert.equal(result.ok, true, result.detail);
});

test('a fixture whose routing the hook enforces passes', () => {
  const result = outcome();
  assert.equal(result.ok, true, result.detail);
});

test('a hook that lets a lead dispatch an orchestrator past the worker limit fails', () => {
  const result = outcome({ dispatch: allowAll });
  assert.equal(result.ok, false);
  assert.match(result.detail, /lead dispatch of `exo:orchestrator` with `Workers: 5` is allowed/);
  assert.match(result.detail, /with no `Workers:` line does not run with the Workers warning/);
});

test('a hook that lets an orchestrator dispatch past its sized slice fails', () => {
  const unbounded = (input, ...rest) => (input.agent_id ? allowAll() : agentHook(input, ...rest));
  const result = outcome({ dispatch: unbounded });
  assert.equal(result.ok, false);
  assert.match(result.detail, /orchestrator sized at `Workers: 2` made 3 research-worker dispatches/);
});

test('a hook that refuses the step 5 worker cap fails', () => {
  const refuseAll = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
  assert.match(outcome({ dispatch: refuseAll }).detail, /step 5 `Workers: 4` is refused/);
});

test('a research worker that can spawn agents or an orchestrator that cannot fails', () => {
  assert.match(outcome({ worker: 'tools: Read, Agent' }).detail, /research-worker can spawn agents/);
  assert.match(outcome({ orchestrator: 'tools: Read, Write' }).detail, /orchestrator cannot dispatch/);
});

test('a step 5 that dispatches research workers directly or names no cap fails', () => {
  const direct = '5. **Dispatch** the `exo:research-worker` agent per sub-question.\n6. **Collect**';
  assert.match(outcome({ research: direct }).detail, /does not dispatch `exo:orchestrator`/);
  assert.match(outcome({ research: '5. **Dispatch** one `exo:orchestrator`.\n6. **Collect**' }).detail, /names no `Workers:` cap/);
});

test('a spawn depth below 2 fails', () => {
  assert.match(outcome({ runLoop: 'set depth to 1+.' }).detail, /spawn depth of 2 or more/);
});
