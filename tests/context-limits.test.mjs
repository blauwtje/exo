import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  AGENT_SOFT_LIMIT, BYTES_PER_TOKEN, contextDecision, contextTokens, HARD_LIMIT, TASK_SPLIT_TOKENS
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
  assert.deepEqual([HARD_LIMIT, AGENT_SOFT_LIMIT, TASK_SPLIT_TOKENS, BYTES_PER_TOKEN],
    [100000, 60000, 25000, 2]);
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

test('a main session outside a detached run is never limited', () => {
  const saved = process.env.EXO_RUN_HANDOFF;
  delete process.env.EXO_RUN_HANDOFF;
  try {
    for (const tokens of [65000, 100000, 120000]) {
      const input = { transcript_path: transcript(`main${tokens}.jsonl`, [entry(tokens)]), cwd: dir, tool_name: 'Read' };
      assert.equal(contextDecision(input), null, String(tokens));
    }
  } finally {
    if (saved !== undefined) process.env.EXO_RUN_HANDOFF = saved;
  }
});

test('a subagent keeps Write at the hard limit and is denied other tools', () => {
  const at = (tool_name) => contextDecision({
    transcript_path: transcript('unused.jsonl', [entry(1000)]),
    agent_id: 'x',
    agent_transcript_path: transcript(`ag-${tool_name}.jsonl`, [entry(100000)]),
    tool_name
  });
  assert.equal(at('Write'), null);
  assert.match(at('Agent').deny, /hard limit/);
});

test('subagent reads its own transcript', () => {
  const main = transcript('s.jsonl', [entry(10000)]);
  transcript('s/subagents/agent-7.jsonl', [entry(65000)]);
  const input = { transcript_path: main, agent_id: '7', tool_name: 'Read' };
  assert.match(contextDecision(input).additionalContext, /report/);
  const own = transcript('own.jsonl', [entry(120000)]);
  assert.match(contextDecision({ ...input, agent_transcript_path: own }).deny, /report/);
  assert.equal(contextDecision({ transcript_path: main, agent_id: 'none' }), null);
  assert.equal(contextDecision({ transcript_path: main, tool_name: 'Read' }), null);
  assert.equal(contextDecision({}), null);
});
