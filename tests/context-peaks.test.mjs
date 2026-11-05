import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { agentContextTarget } from '../lib/context-limits.mjs';
import { contextPeaks } from '../lib/context-decisions.mjs';

function usageLine(tokens) {
  return JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 } } });
}

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.jsonl'), `${usageLine(90000)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'exo:build-task' }));
  return folder;
}

test('rows carry the agent type, sessions are typed session', () => {
  const rows = contextPeaks({ folder: fixture(), since: 0 });
  assert.deepEqual(rows.map((row) => row.agentType), ['exo:build-task', 'session']);
});

test('a peak exactly at the target is a row at or over the target', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(agentContextTarget())}\n`);
  const rows = contextPeaks({ folder, since: 0 });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].peak >= agentContextTarget());
});

test('rows carry the output tokens', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-peaks-'));
  const subagents = path.join(folder, 's1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  fs.writeFileSync(path.join(folder, 's1.jsonl'), `${usageLine(1000)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-o0.jsonl'), `${usageLine(5000)}\n${usageLine(4990)}\n`);
  fs.writeFileSync(path.join(subagents, 'agent-o0.meta.json'), JSON.stringify({ agentType: 'exo:orchestrator' }));
  const rows = contextPeaks({ folder, since: 0 });
  assert.equal(rows.find((row) => row.agentType === 'exo:orchestrator').output, 2);
});
