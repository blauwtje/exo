import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { usageReport } from '../evals/model-usage.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'evals', 'model-usage.mjs');

function assistant({ id, model, day, blocks = [], usage = {}, entrypoint }) {
  return {
    type: 'assistant',
    timestamp: `${day}T10:00:00.000Z`,
    entrypoint,
    message: { id, model, content: blocks, usage },
  };
}

const bash = (id, command) => ({ type: 'tool_use', id, name: 'Bash', input: { command } });
const agent = (id, input) => ({ type: 'tool_use', id, name: 'Agent', input });

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-usage-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, 'proj', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : content.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  }
  return root;
}

const row = (report, kind, family) => report.kinds.find((entry) => entry.kind === kind && entry.family === family);

test('main sessions count tool calls, read-only bash and tokens per family, deduped by message id', async () => {
  const usage = { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 };
  const root = project({
    's1.jsonl': [
      assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-20', usage: { ...usage, output_tokens: 2 }, blocks: [bash('b1', 'cat a.txt')] }),
      assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-20', usage, blocks: [bash('b1', 'cat a.txt'), bash('b2', 'npm test')] }),
      assistant({ id: 'm2', model: '<synthetic>', day: '2026-11-20', usage, blocks: [bash('b3', 'ls')] }),
      assistant({ id: 'm3', model: 'claude-opus-5-5', day: '2026-11-20', usage, blocks: [bash('b4', 'git status'), bash('b5', 'sed -n 1,5p x'), bash('b6', 'sed -i s/a/b/ x')] }),
    ],
  });
  const opus = row(await usageReport(root), 'main', 'opus');
  assert.deepEqual(
    { ...opus },
    { kind: 'main', family: 'opus', sessions: 1, toolCalls: 5, bash: 5, readOnlyBashPct: 60, inputTokens: 222, outputTokens: 10 },
  );
});

test('a session with an sdk-cli entry is headless, and a model without a known name is other', async () => {
  const root = project({
    'h.jsonl': [assistant({ id: 'm1', model: 'claude-fable-1', day: '2026-11-20', entrypoint: 'sdk-cli' })],
    'o.jsonl': [assistant({ id: 'm2', model: 'gpt-x', day: '2026-11-20' })],
  });
  const report = await usageReport(root);
  assert.equal(row(report, 'headless', 'fable').sessions, 1);
  assert.equal(row(report, 'main', 'other').sessions, 1);
});

test('the window keeps both days inclusive and drops sessions with no entry inside it', async () => {
  const root = project({
    'a.jsonl': [assistant({ id: 'm1', model: 'claude-haiku-5', day: '2026-11-14' })],
    'b.jsonl': [assistant({ id: 'm2', model: 'claude-haiku-5', day: '2026-11-15' }), assistant({ id: 'm3', model: 'claude-haiku-5', day: '2026-11-26' })],
    'c.jsonl': [assistant({ id: 'm4', model: 'claude-haiku-5', day: '2026-11-25' })],
  });
  const report = await usageReport(root, { since: '2026-11-15', until: '2026-11-25' });
  assert.equal(row(report, 'main', 'haiku').sessions, 2);
});

test('a subagent transcript takes its type from meta, asked from the parent call and ran from its model', async () => {
  const root = project({
    's1.jsonl': [
      assistant({ id: 'p1', model: 'claude-opus-5-5', day: '2026-11-20', blocks: [agent('call1', { subagent_type: 'exo:builder', model: 'sonnet' })] }),
    ],
    's1/subagents/agent-1.jsonl': [assistant({ id: 's1', model: 'claude-sonnet-5-5', day: '2026-11-20', blocks: [bash('x1', 'ls'), bash('x2', 'ls')] })],
    's1/subagents/agent-1.meta.json': JSON.stringify({ agentType: 'exo:builder', toolUseId: 'call1' }),
    's1/subagents/agent-2.jsonl': [assistant({ id: 's2', model: 'claude-opus-5-5', day: '2026-11-20', blocks: [bash('x3', 'ls')] })],
    's1/subagents/agent-2.meta.json': JSON.stringify({ agentType: 'exo:researcher', toolUseId: 'unknown-call' }),
  });
  const report = await usageReport(root);
  assert.deepEqual(report.agents.map((entry) => ({ ...entry })), [
    { agentType: 'exo:builder', asked: 'sonnet', ran: 'sonnet', transcripts: 1, toolCalls: 2 },
    { agentType: 'exo:researcher', asked: 'none', ran: 'opus', transcripts: 1, toolCalls: 1 },
  ]);
  assert.equal(row(report, 'subagent', 'sonnet').sessions, 1);
});

test('the command line prints both tables for the given projects folder', () => {
  const root = project({ 's.jsonl': [assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-20', blocks: [bash('b1', 'ls')] })] });
  const output = execFileSync(process.execPath, [SCRIPT, '--projects', root, '--since', '2026-11-20', '--until', '2026-11-20'], { encoding: 'utf8' });
  assert.match(output, /\| main \| opus \| 1 \| 1 \| 1 \| 100 \| 0 \| 0 \|/);
  assert.match(output, /\| agentType \| asked \| ran \| transcripts \| toolCalls \|/);
});

test('messages with neither id nor uuid are each counted, not merged into one', async () => {
  const usage = { output_tokens: 7 };
  const root = project({
    's.jsonl': [
      assistant({ model: 'claude-opus-5-5', day: '2026-11-20', usage }),
      assistant({ model: 'claude-opus-5-5', day: '2026-11-20', usage }),
    ],
  });
  assert.equal(row(await usageReport(root), 'main', 'opus').outputTokens, 14);
});

test('a subagent that ran on two families is counted under each, with its tool calls split by family', async () => {
  const root = project({
    's1/subagents/agent-1.jsonl': [
      assistant({ id: 'a', model: 'claude-sonnet-5-5', day: '2026-11-20', blocks: [bash('x1', 'ls')] }),
      assistant({ id: 'b', model: 'claude-opus-5-5', day: '2026-11-20', blocks: [bash('x2', 'ls'), bash('x3', 'ls')] }),
    ],
    's1/subagents/agent-1.meta.json': JSON.stringify({ agentType: 'exo:builder' }),
  });
  const report = await usageReport(root);
  assert.deepEqual(report.agents.map((entry) => ({ ...entry })), [
    { agentType: 'exo:builder', asked: 'none', ran: 'sonnet', transcripts: 1, toolCalls: 1 },
    { agentType: 'exo:builder', asked: 'none', ran: 'opus', transcripts: 1, toolCalls: 2 },
  ]);
});

test('a malformed line is skipped and the other lines still count', async () => {
  const good = JSON.stringify(assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-20' }));
  const root = project({ 's.jsonl': `{not json\n${good}\n` });
  assert.equal(row(await usageReport(root), 'main', 'opus').sessions, 1);
});

test('a subagent without agentType in meta takes the parent call subagent_type, and without a meta file is unknown', async () => {
  const root = project({
    's1.jsonl': [assistant({ id: 'p1', model: 'claude-opus-5-5', day: '2026-11-20', blocks: [agent('call1', { subagent_type: 'exo:builder' })] })],
    's1/subagents/agent-1.jsonl': [assistant({ id: 's1', model: 'claude-sonnet-5-5', day: '2026-11-20' })],
    's1/subagents/agent-1.meta.json': JSON.stringify({ toolUseId: 'call1' }),
    's1/subagents/agent-2.jsonl': [assistant({ id: 's2', model: 'claude-sonnet-5-5', day: '2026-11-20' })],
  });
  const report = await usageReport(root);
  assert.deepEqual(report.agents.map((entry) => entry.agentType), ['exo:builder', 'unknown']);
});

test('the command line leaves out entries outside --since and --until', () => {
  const root = project({
    's.jsonl': [
      assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-19' }),
      assistant({ id: 'm2', model: 'claude-sonnet-5-5', day: '2026-11-20' }),
      assistant({ id: 'm3', model: 'claude-haiku-5', day: '2026-11-21' }),
    ],
  });
  const output = execFileSync(process.execPath, [SCRIPT, '--projects', root, '--since', '2026-11-20', '--until', '2026-11-20'], { encoding: 'utf8' });
  assert.match(output, /\| main \| sonnet \|/);
  assert.doesNotMatch(output, /opus|haiku/);
});

test('a --since or --until that is not YYYY-MM-DD is a usage error', () => {
  const root = project({ 's.jsonl': [assistant({ id: 'm1', model: 'claude-opus-5-5', day: '2026-11-20' })] });
  for (const flag of ['--since', '--until']) {
    const result = spawnSync(process.execPath, [SCRIPT, '--projects', root, flag, '2026-1-5'], { encoding: 'utf8' });
    assert.equal(result.status, 2, flag);
    assert.match(result.stderr, new RegExp(`${flag}.*2026-1-5`), flag);
  }
});
