import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COORDINATOR_TYPES } from '../lib/context-decisions.mjs';

const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));

test('task-runner is a coordinator type', () => {
  assert.ok(COORDINATOR_TYPES.has('task-runner'));
});

test('the subagent-coordinator row allows one dispatch level in every harness', () => {
  const contract = readJson('../harnesses/coordination-contract.json');
  for (const harness of ['claude', 'codex', 'opencode']) {
    const row = contract[harness]['subagent-coordinator'];
    assert.equal(row.mayDispatch, true, harness);
    assert.equal(row.maxDepth, 1, harness);
  }
});

test('the agent tier still holds the task-runner agent', () => {
  const agents = readJson('../benchmarks/agent-tier/agents.json');
  assert.ok(agents['task-runner']);
});
