#!/usr/bin/env node
// benchmarks/split.mjs
// Compares flow cells by token type, call count and context size, so a change
// to the build flow can be measured against earlier flow runs:
//
//   node benchmarks/split.mjs <runDir>...
//
// Each run dir holds one folder per cell with a usage.json; its `transcript`
// is the kept main-thread transcript. A cell name found in several run dirs is
// averaged over them. Per cell it prints the mean of: assistant calls (one per
// message id, as the transcript holds one line per content block), the context
// of the first, the last and the mean call (input + cache read + both cache
// writes), the weighted tokens per type, their total, and the tool calls per run.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { COUNT_KEYS, sumCounts, usageCounts } from '#token-weights';

// The weight of one token of each type, read from sumCounts so the rates stay in token-weights.mjs.
const RATES = Object.fromEntries(COUNT_KEYS.map((key) => [key, key === 'output' ? 1 : sumCounts([{ [key]: 1 }]).weightedInput]));

const FIELDS = ['calls', 'firstContext', 'lastContext', 'meanContext', ...COUNT_KEYS.map((key) => `weighted_${key}`), 'total'];

const contextOf = (counts) => counts.input + counts.cacheRead + counts.cache5m + counts.cache1h;

// The split of one transcript: its calls by message id, in file order, and its tool calls by name.
export function transcriptSplit(file) {
  if (!fs.existsSync(file)) throw new Error(`${file}: transcript not found`);
  const calls = new Map();
  const tools = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (entry.type !== 'assistant' || !message?.id || !message.usage) continue;
    calls.set(message.id, usageCounts(message.usage));
    for (const block of message.content ?? []) {
      if (block.type === 'tool_use') tools[block.name] = (tools[block.name] ?? 0) + 1;
    }
  }
  const list = [...calls.values()];
  if (list.length === 0) throw new Error(`${file}: no assistant calls`);
  const contexts = list.map(contextOf);
  const totals = sumCounts(list);
  const split = {
    calls: list.length,
    firstContext: contexts[0],
    lastContext: contexts.at(-1),
    meanContext: contexts.reduce((a, b) => a + b, 0) / contexts.length,
    total: totals.weightedInput + totals.output
  };
  for (const key of COUNT_KEYS) split[`weighted_${key}`] = totals[key] * RATES[key];
  return { split, tools };
}

// The cells of a run dir: its subfolders that hold a usage.json.
export function cellNames(runDir) {
  return fs.readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(runDir, entry.name, 'usage.json')))
    .map((entry) => entry.name)
    .sort();
}

// The split of every cell over the run dirs, one row per run that has the cell.
export function splitRuns(runDirs) {
  const cells = new Map();
  for (const runDir of runDirs) {
    for (const name of cellNames(runDir)) {
      const usageFile = path.join(runDir, name, 'usage.json');
      const { transcript } = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
      if (!transcript) throw new Error(`${usageFile}: no transcript path`);
      if (!cells.has(name)) cells.set(name, []);
      cells.get(name).push(transcriptSplit(transcript));
    }
  }
  return cells;
}

export function splitReport(cells) {
  const lines = [];
  for (const [name, rows] of cells) {
    const mean = (field) => Math.round(rows.reduce((sum, row) => sum + row.split[field], 0) / rows.length);
    const [calls, first, last, meanContext, input, read, write5m, write1h, output, total] = FIELDS.map(mean);
    lines.push(`${name} runs=${rows.length} calls=${calls} firstCtx=${first} lastCtx=${last} meanCtx=${meanContext} | read=${read} write1h=${write1h} write5m=${write5m} out=${output} in=${input} total=${total}`);
    const tools = {};
    for (const row of rows) {
      for (const [tool, count] of Object.entries(row.tools)) tools[tool] = (tools[tool] ?? 0) + count / rows.length;
    }
    lines.push(`   tools/run ${JSON.stringify(Object.fromEntries(Object.entries(tools).map(([tool, count]) => [tool, +count.toFixed(1)])))}`);
  }
  return lines.join('\n');
}

function main(args) {
  if (args.length === 0) {
    console.error('usage: node benchmarks/split.mjs <runDir>...');
    return 2;
  }
  try {
    console.log(splitReport(splitRuns(args)));
    return 0;
  } catch (error) {
    console.error(`split.mjs: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
