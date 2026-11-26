import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, '..', 'skills', 'build', 'scripts', 'run-usage.mjs');

const entry = (time, id, usage) => ({
  type: 'assistant',
  timestamp: `2026-11-26T${time}.000Z`,
  message: { id, model: 'claude-sonnet-5-5', content: [], usage },
});

function projects(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-usage-'));
  for (const [name, entries] of Object.entries(files)) {
    const file = path.join(root, 'proj', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, entries.map((item) => JSON.stringify(item)).join('\n') + '\n');
  }
  return root;
}

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('sums deduped tokens and minutes per transcript from the start time', () => {
  const root = projects({
    's1.jsonl': [
      entry('09:00:00', 'old', { input_tokens: 999, output_tokens: 999 }),
      entry('10:00:00', 'a', { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 5, output_tokens: 3 }),
      entry('10:00:30', 'a', { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 5, output_tokens: 7 }),
      entry('10:10:00', 'b', { input_tokens: 1, output_tokens: 1 }),
    ],
    's1/subagents/agent-x.jsonl': [
      entry('10:02:00', 'c', { input_tokens: 100, output_tokens: 10 }),
      entry('10:05:00', 'd', { input_tokens: 100, output_tokens: 10 }),
    ],
  });
  const result = run('--session', 's1', '--since', '2026-11-26T10:00:00Z', '--projects', root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'Lead: 21 input, 8 output tokens, 10 min',
    'Helper agent-x.jsonl: 200 input, 20 output tokens, 3 min',
    'Total: 221 input, 28 output tokens, lead 10 min, helpers 3 min',
  ]);
});

test('an id with no session file exits 2', () => {
  const root = projects({ 's1.jsonl': [entry('10:00:00', 'a', {})] });
  const result = run('--session', 'missing', '--since', '2026-11-26T10:00:00Z', '--projects', root);
  assert.equal(result.status, 2);
});

test('a helper transcript with no entries since the start time prints no line', () => {
  const root = projects({
    's1.jsonl': [entry('10:00:00', 'a', { input_tokens: 1, output_tokens: 1 })],
    's1/subagents/agent-old.jsonl': [entry('09:00:00', 'o', { input_tokens: 5, output_tokens: 5 })],
  });
  const result = run('--session', 's1', '--since', '2026-11-26T10:00:00Z', '--projects', root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'Lead: 1 input, 1 output tokens, 0 min',
    'Total: 1 input, 1 output tokens, lead 0 min, helpers 0 min',
  ]);
});

test('Total helpers minutes count overlapping helper intervals once', () => {
  const root = projects({
    's1.jsonl': [entry('10:00:00', 'a', { input_tokens: 1, output_tokens: 1 })],
    's1/subagents/agent-x.jsonl': [
      entry('10:00:00', 'c', { input_tokens: 1, output_tokens: 1 }),
      entry('10:04:00', 'd', { input_tokens: 1, output_tokens: 1 }),
    ],
    's1/subagents/agent-y.jsonl': [
      entry('10:02:00', 'e', { input_tokens: 1, output_tokens: 1 }),
      entry('10:06:00', 'f', { input_tokens: 1, output_tokens: 1 }),
    ],
  });
  const result = run('--session', 's1', '--since', '2026-11-26T10:00:00Z', '--projects', root);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.match(lines[1], /4 min$/);
  assert.match(lines[2], /4 min$/);
  assert.match(lines[3], /helpers 6 min$/);
});
