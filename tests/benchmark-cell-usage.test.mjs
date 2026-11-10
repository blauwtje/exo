import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeCellUsage } from '../benchmarks/cell-usage.mjs';
import { countsCost } from '../benchmarks/pricing.mjs';

const MODEL = 'claude-sonnet-4-5';

function assistantLine({ id, input, output, tools = [] }) {
  const content = tools.map((tool) => ({ type: 'tool_use', id: tool.id, name: tool.name }));
  return JSON.stringify({ type: 'assistant', message: { id, model: MODEL, content, usage: { input_tokens: input, output_tokens: output } } });
}

function resultLine(toolUseId, text) {
  return JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }] } });
}

function writeTranscripts(root) {
  const project = path.join(root, 'projects', 'slug');
  const subagents = path.join(project, 'session1', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  const main = [assistantLine({ id: 'm1', input: 100, output: 10, tools: [{ id: 'r1', name: 'Read' }] }), resultLine('r1', 'x'.repeat(400))];
  const tools = [{ id: 'r2', name: 'Read' }, { id: 'b1', name: 'Bash' }];
  const sub = [assistantLine({ id: 'm2', input: 200, output: 20, tools }), resultLine('r2', 'y'.repeat(80)), resultLine('b1', 'z'.repeat(800))];
  fs.writeFileSync(path.join(project, 'session1.jsonl'), main.join('\n') + '\n');
  fs.writeFileSync(path.join(subagents, 'agent-a.jsonl'), sub.join('\n') + '\n');
  fs.writeFileSync(path.join(subagents, 'agent-a.meta.json'), JSON.stringify({ agentType: 'implementer' }));
}

function assertByRole(usage, cell) {
  assert.deepEqual(Object.keys(usage.byRole).sort(), ['implementer', 'main']);
  assert.equal(usage.byRole.main.counts.input, 100);
  assert.equal(usage.byRole.implementer.counts.input, 200);
  assert.equal(usage.byRole.main.estimatedReadTokens, 100);
  assert.equal(usage.byRole.implementer.estimatedReadTokens, 20);
  assert.equal(usage.byRole.implementer.costUsd, countsCost(usage.byRole.implementer.counts, MODEL));
  assert.equal(JSON.parse(fs.readFileSync(path.join(cell, 'usage.json'), 'utf8')).byRole.main.estimatedReadTokens, 100);
}

test('usage.json splits tokens, cost and Read results by agent type', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-usage-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = root;
  try {
    writeTranscripts(root);
    const cell = path.join(root, 'cell');
    fs.mkdirSync(cell);
    assertByRole(writeCellUsage(cell, 'session1'), cell);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});

test('backfill adds byRole to an old usage.json and keeps its other fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-usage-'));
  writeTranscripts(root);
  const runs = path.join(root, 'runs');
  const cell = path.join(runs, 'cell');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ session_id: 'session1' }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify({ costUsd: 3, sessions: 4, missingTranscripts: 1, missingHooks: 2 }));
  const script = fileURLToPath(new URL('../benchmarks/backfill-usage.mjs', import.meta.url));
  execFileSync(process.execPath, [script, runs], { env: { ...process.env, CLAUDE_CONFIG_DIR: root } });
  const usage = JSON.parse(fs.readFileSync(path.join(cell, 'usage.json'), 'utf8'));
  assert.deepEqual([usage.costUsd, usage.sessions, usage.missingTranscripts, usage.missingHooks], [3, 4, 1, 2]);
  assert.equal(usage.byRole, null);
});

test('backfill adds byRole to a single-session usage.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-usage-'));
  writeTranscripts(root);
  const runs = path.join(root, 'runs');
  const cell = path.join(runs, 'cell');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ session_id: 'session1' }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify({ leadPeakTokens: 7 }));
  const script = fileURLToPath(new URL('../benchmarks/backfill-usage.mjs', import.meta.url));
  execFileSync(process.execPath, [script, runs], { env: { ...process.env, CLAUDE_CONFIG_DIR: root } });
  const usage = JSON.parse(fs.readFileSync(path.join(cell, 'usage.json'), 'utf8'));
  assert.equal(usage.leadPeakTokens, 7);
  assert.deepEqual(Object.keys(usage.byRole).sort(), ['implementer', 'main']);
});

test('usage.json keeps a context peak per hop, a coordinator file apart from worker files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-usage-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = root;
  try {
    writeTranscripts(root);
    const subagents = path.join(root, 'projects', 'slug', 'session1', 'subagents');
    fs.writeFileSync(path.join(subagents, 'agent-b.jsonl'), `${assistantLine({ id: 'm3', input: 500, output: 5 })}\n`);
    fs.writeFileSync(path.join(subagents, 'agent-b.meta.json'), JSON.stringify({ agentType: 'exo:orchestrator' }));
    const cell = path.join(root, 'cell');
    fs.mkdirSync(cell);
    const usage = writeCellUsage(cell, 'session1');
    assert.deepEqual(usage.hopPeakTokens, { main: 100, coordinator: 500, workers: 200 });
    assert.equal(usage.leadPeakTokens, 100);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});
