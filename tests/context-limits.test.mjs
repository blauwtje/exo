import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  AGENT_SOFT_LIMIT, BYTES_PER_TOKEN, contextDecision, contextTokens, HARD_LIMIT, LEAD_SOFT_LIMIT, TASK_SPLIT_TOKENS
} from '../lib/context-limits.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'));
const entry = (tokens) => JSON.stringify({
  type: 'assistant',
  message: { usage: { input_tokens: 1, cache_read_input_tokens: tokens - 11, cache_creation_input_tokens: 10 } }
});
function transcript(name, lines) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

test('constants', () => {
  assert.deepEqual([HARD_LIMIT, LEAD_SOFT_LIMIT, AGENT_SOFT_LIMIT, TASK_SPLIT_TOKENS, BYTES_PER_TOKEN],
    [100000, 60000, 50000, 25000, 4]);
});

test('contextTokens sums the last assistant usage and tolerates junk', () => {
  const file = transcript('a.jsonl', [entry(1000), entry(42000), '{"type":"user"}', 'not json']);
  assert.equal(contextTokens(file), 42000);
  assert.equal(contextTokens(path.join(dir, 'missing.jsonl')), null);
  assert.equal(contextTokens(transcript('b.jsonl', ['{"type":"user"}'])), null);
  assert.equal(contextTokens(undefined), null);
});

test('contextTokens reads only the tail of a large file', () => {
  const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(1000) });
  const file = transcript('big.jsonl', [entry(5000), ...Array(2000).fill(filler), entry(7000)]);
  assert.equal(contextTokens(file), 7000);
  const old = transcript('old.jsonl', [entry(5000), ...Array(2000).fill(filler)]);
  assert.equal(contextTokens(old), null);
});

test('lead decisions', () => {
  const at = (n, extra = {}) => contextDecision({ transcript_path: transcript(`l${n}.jsonl`, [entry(n)]), cwd: dir, ...extra });
  assert.equal(at(59000), null);
  assert.match(at(60000).additionalContext, /exo:save-session/);
  const denied = at(100000, { tool_name: 'Read' });
  assert.match(denied.deny, /handoff/);
  assert.equal(at(100000, { tool_name: 'Write' }), null);
});

test('subagent reads its own transcript', () => {
  const main = transcript('s.jsonl', [entry(10000)]);
  transcript('s/subagents/agent-7.jsonl', [entry(55000)]);
  const input = { transcript_path: main, agent_id: '7', tool_name: 'Read' };
  assert.match(contextDecision(input).additionalContext, /report/);
  const own = transcript('own.jsonl', [entry(120000)]);
  assert.match(contextDecision({ ...input, agent_transcript_path: own }).deny, /report/);
  assert.equal(contextDecision({ transcript_path: main, agent_id: 'none' }), null);
  assert.equal(contextDecision({}), null);
});
