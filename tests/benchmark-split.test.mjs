// benchmarks/split.mjs splits flow cells by token type, call count and context
// size from the kept transcripts their usage.json files name, one call per
// message id, and averages a cell name over the run dirs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { splitReport, splitRuns, transcriptSplit } from '../benchmarks/split.mjs';

const SPLIT = fileURLToPath(new URL('../benchmarks/split.mjs', import.meta.url));

function assistant(id, usage, content) {
  return { type: 'assistant', message: { id, role: 'assistant', content, usage } };
}

function usage(input, cacheRead, cache1h, cache5m, output) {
  return { input_tokens: input, cache_read_input_tokens: cacheRead, output_tokens: output, cache_creation: { ephemeral_1h_input_tokens: cache1h, ephemeral_5m_input_tokens: cache5m } };
}

const toolUse = (name) => ({ type: 'tool_use', name });

// A run dir with one cell whose transcript has two calls; the first is split over two lines.
async function runDir(root, name, cell, scale) {
  const dir = path.join(root, name);
  const transcript = path.join(root, `${name}-${cell}.jsonl`);
  const lines = [
    assistant('m1', usage(10 * scale, 0, 1000 * scale, 0, 20 * scale), [{ type: 'text', text: 'ok' }]),
    assistant('m1', usage(10 * scale, 0, 1000 * scale, 0, 20 * scale), [toolUse('Bash')]),
    { type: 'user', message: { role: 'user', content: 'x' } },
    assistant('m2', usage(5 * scale, 1000 * scale, 0, 100 * scale, 30 * scale), [toolUse('Bash'), toolUse('Read')])
  ];
  await fs.writeFile(transcript, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  await fs.mkdir(path.join(dir, cell), { recursive: true });
  await fs.writeFile(path.join(dir, cell, 'usage.json'), JSON.stringify({ transcript }));
  return dir;
}

test('transcriptSplit counts one call per message id with its weighted types and tools', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-split-'));
  const dir = await runDir(root, 'r1', 'flow-c7', 1);
  const { transcript } = JSON.parse(await fs.readFile(path.join(dir, 'flow-c7', 'usage.json'), 'utf8'));
  const { split, tools } = transcriptSplit(transcript);
  assert.equal(split.calls, 2);
  assert.equal(split.firstContext, 1010);
  assert.equal(split.lastContext, 1105);
  assert.equal(split.meanContext, 1057.5);
  assert.equal(split.weighted_cacheRead, 100);
  assert.equal(split.weighted_cache1h, 2000);
  assert.equal(split.weighted_cache5m, 125);
  assert.equal(split.weighted_output, 50);
  assert.equal(split.weighted_input, 15);
  assert.equal(split.total, 2290);
  assert.deepEqual(tools, { Bash: 2, Read: 1 });
});

test('splitRuns averages a cell name over the run dirs and finds cells by usage.json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-split-'));
  const one = await runDir(root, 'r1', 'flow-c7', 1);
  const two = await runDir(root, 'r2', 'flow-c7', 3);
  await fs.mkdir(path.join(two, 'no-usage'), { recursive: true });
  const cells = splitRuns([one, two]);
  assert.deepEqual([...cells.keys()], ['flow-c7']);
  const report = splitReport(cells);
  assert.match(report, /^flow-c7 runs=2 calls=2 firstCtx=2020 lastCtx=2210 /);
  assert.match(report, /total=4580\n/);
  assert.match(report, /tools\/run \{"Bash":2,"Read":1\}$/);
});

test('a missing transcript is an error naming the file, not a stack trace', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-split-'));
  const dir = path.join(root, 'r1');
  const missing = path.join(root, 'gone.jsonl');
  await fs.mkdir(path.join(dir, 'flow-base'), { recursive: true });
  await fs.writeFile(path.join(dir, 'flow-base', 'usage.json'), JSON.stringify({ transcript: missing }));
  const run = spawnSync(process.execPath, [SPLIT, dir], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes(`${missing}: transcript not found`));
  assert.ok(!run.stderr.includes('    at '));
});

test('no argument prints the usage line and exits 2', () => {
  const run = spawnSync(process.execPath, [SPLIT], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^usage: node benchmarks\/split\.mjs <runDir>\.\.\./);
});
