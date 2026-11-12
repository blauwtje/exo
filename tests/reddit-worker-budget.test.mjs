import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentHook } from '../hooks/agent-effort.mjs';
import { workerSize } from '../lib/worker-size.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reddit-budget-'));
const prompt = 'exo-kind: lookup\nReads: none\nFetches: 5\nSources: web, reddit\nResult: .exo/r.md';
const denial = () => agentHook({
  tool_name: 'Agent',
  agent_type: 'exo:orchestrator',
  cwd,
  tool_input: { subagent_type: 'exo:research-worker', description: 'work', prompt }
}, 'on', () => false)?.hookSpecificOutput?.additionalContext ?? '';

test('a size note for Fetches: 5 on reddit keeps the asked total and names a split that fits', () => {
  const size = workerSize({ prompt, cwd, requireFetches: true });
  assert.ok(size.tokens > size.budget);
  const reason = denial();
  assert.match(reason, /Keep the asked total of 5 Fetches/);
  assert.match(reason, /2 workers/);
  assert.match(reason, /at most 3 Fetches each/);
});
