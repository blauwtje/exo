// The savings ledger reads the transcript the harness writes: one line per
// content block sharing a message id, streaming repeats with a growing output
// count, and tool results carrying structured patches. These fixtures pin the
// shape observed on 2026-09-11; a format change shows up here first.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SAVINGS = fileURLToPath(new URL('../skills/savings/scripts/savings.mjs', import.meta.url));

function runWithStdin(args, input, env) {
  return run(SAVINGS, args, { env, input });
}

function usage(output, extra = {}) {
  return { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 200, output_tokens: output, ...extra };
}

const MAIN_USAGE = {
  input_tokens: 10,
  cache_creation_input_tokens: 1000,
  cache_read_input_tokens: 2000,
  output_tokens: 100,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }
};

const MAIN_LINES = [
  { type: 'assistant', uuid: 'a1', timestamp: '2026-09-11T10:00:00.000Z', attributionSkill: 'exo:right-sizing',
    message: { id: 'msg_A', model: 'claude-fable-5-1', usage: MAIN_USAGE, content: [{ type: 'thinking' }] } },
  { type: 'assistant', uuid: 'a2', timestamp: '2026-09-11T10:00:01.000Z',
    message: { id: 'msg_A', model: 'claude-fable-5-1', usage: MAIN_USAGE, content: [{ type: 'tool_use' }] } },
  { type: 'user', uuid: 'u1', timestamp: '2026-09-11T10:01:00.000Z',
    toolUseResult: { filePath: '/x/a.js', oldString: 'old', newString: 'new', structuredPatch: [{ lines: ['-old', '+new1', '+new2', '+new3', ' context'] }] } },
  { type: 'user', uuid: 'u2', timestamp: '2026-09-11T10:02:00.000Z',
    toolUseResult: { type: 'create', filePath: '/x/b.js', content: 'l1\nl2\nl3\nl4\nl5', originalFile: null, structuredPatch: [] } },
  { type: 'user', uuid: 'u3', timestamp: '2026-09-11T10:03:00.000Z',
    toolUseResult: { type: 'update', filePath: '/x/c.js', content: 'n1\nn2', originalFile: 'o1\no2\no3', structuredPatch: [] } }
];

const DELEGATE_LINES = [4, 4, 407].map((output, index) => ({
  type: 'assistant', uuid: `s${index}`, timestamp: '2026-09-11T10:02:30.000Z', isSidechain: true,
  message: { id: 'msg_B', model: 'claude-sonnet-5', usage: usage(output), content: [{ type: 'text' }] }
}));

async function transcriptFixture() {
  const directory = await fixture();
  const transcript = path.join(directory, 'session-1.jsonl');
  await fs.writeFile(transcript, `${MAIN_LINES.map((line) => JSON.stringify(line)).join('\n')}\nnot json\n`);
  const subagents = path.join(directory, 'session-1', 'subagents');
  await fs.mkdir(subagents, { recursive: true });
  await fs.writeFile(path.join(subagents, 'agent-s.jsonl'), `${DELEGATE_LINES.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return { configDirectory: directory, transcript };
}

async function readLedger(configDirectory) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeLedger(configDirectory, sessions) {
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(sessions));
}

test('record sums usage once per message id, weights the cache, and counts patched lines', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const first = await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(first.code, 0, first.stderr);
  const session = (await readLedger(configDirectory)).s1;
  assert.deepEqual(session.tokens, {
    input: 15, cacheRead: 2000, cache5m: 200, cache1h: 1000, output: 507, raw: 3722, weightedInput: 2465
  });
  assert.deepEqual(session.lines, { added: 10, removed: 4 });
  assert.equal(session.rightSized, true);
  assert.equal(session.model, 'claude-fable-5-1');
  assert.equal(session.started, '2026-09-11T10:00:00.000Z');
  assert.equal(session.updated, '2026-09-11T10:03:00.000Z');
  assert.deepEqual(session.guard, { capped: 0, duplicates: 0, bytesWithheld: 0 });
});

test('record is idempotent across runs and appended lines are picked up', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const hookInput = JSON.stringify({ session_id: 's1', transcript_path: transcript });
  await runWithStdin(['record'], hookInput, env);
  await runWithStdin(['record'], hookInput, env);
  let session = (await readLedger(configDirectory)).s1;
  assert.deepEqual(session.lines, { added: 10, removed: 4 });
  assert.equal(session.tokens.output, 507);

  const appended = { type: 'assistant', uuid: 'a9', timestamp: '2026-09-11T10:09:00.000Z',
    message: { id: 'msg_C', model: 'claude-fable-5-1', usage: usage(50), content: [{ type: 'text' }] } };
  await fs.appendFile(transcript, `${JSON.stringify(appended)}\n`);
  await runWithStdin(['record'], hookInput, env);
  session = (await readLedger(configDirectory)).s1;
  assert.equal(session.tokens.output, 557);
  assert.equal(session.updated, '2026-09-11T10:09:00.000Z');
});

test('statusline stores the cost and prints the estimated saving segment', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  const statusInput = JSON.stringify({
    session_id: 's1', transcript_path: transcript,
    cost: { total_cost_usd: 1.5, total_duration_ms: 600000, total_lines_added: 12, total_lines_removed: 4 }
  });
  const result = await runWithStdin(['statusline'], statusInput, env);
  assert.equal(result.code, 0, result.stderr);
  // lines 10 × 0.54/0.46 = 11.7, tokens 2972 × 0.22/0.78 = 838, cost 1.5 × 0.2/0.8 = 0.375, time 10 min × 0.27/0.73 = 3.7 min
  assert.equal(result.stdout, 'saved ≈ 12 LOC · 838 tok · $0.38 · 4m');
  const session = (await readLedger(configDirectory)).s1;
  assert.equal(session.costUsd, 1.5);
  assert.equal(session.durationMs, 600000);
});

test('statusline appends the measured guard figure when bytes were withheld', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  await writeLedger(configDirectory, { s0: { guard: { capped: 2, duplicates: 1, bytesWithheld: 48000 } } });
  const result = await runWithStdin(['statusline'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'saved ≈ 12 LOC · 838 tok · - · 1m · guard ≈ 12k tok');
});

test('report prints actuals, right-sized totals, the labelled estimate and the guard line', async () => {
  const { configDirectory, transcript } = await transcriptFixture();
  const env = { CLAUDE_CONFIG_DIR: configDirectory };
  await runWithStdin(['record'], JSON.stringify({ session_id: 's1', transcript_path: transcript }), env);
  const result = await runWithStdin(['report'], '', env);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /all sessions \(1\)\s+10\s+3\.0k\s+-\s+3m/);
  assert.match(result.stdout, /right-sized sessions \(1\)/);
  assert.match(result.stdout, /estimated saved\s+12\s+838\s+-\s+1m/);
  assert.match(result.stdout, /Read guard \(measured\): 0 unbounded reads capped, 0 unchanged re-reads refused, ≈ 0 tok withheld/);
  assert.match(result.stdout, /Estimate: actual × r \/ \(1 − r\)/);
  assert.match(result.stdout, /cost is recorded by the status line segment only/);
});

test('an unknown command fails with usage', async () => {
  const result = await runWithStdin(['bogus'], '', {});
  assert.equal(result.code, 1);
  assert.match(result.stderr, /usage: savings\.mjs record\|statusline\|report/);
});

test('report exits non-zero and surfaces the error on a ledger fault', async () => {
  const directory = await fixture();
  const configFile = path.join(directory, 'config-is-a-file');
  await fs.writeFile(configFile, 'not a directory');
  const result = await runWithStdin(['report'], '', { CLAUDE_CONFIG_DIR: configFile });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /^savings: /);
});
