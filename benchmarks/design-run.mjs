#!/usr/bin/env node
// benchmarks/design-run.mjs
// What one designing run spent, inside the window its run directory spans. The
// window opens at the directory's creation, or at its earliest file where the
// filesystem records no creation time, and closes at its latest file. Tokens
// count only the assistant responses timestamped inside that window, in the
// session transcript and its delegate transcripts; every other response is
// reported as excluded, never added, so work before or after the run cannot
// inflate its figures. The closing reply after the last checkpoint falls
// outside the window: that is the ceiling of a window read from files. The
// transcript format is internal to the harness; a line that does not parse is
// skipped.
//
//   node benchmarks/design-run.mjs --transcript <session .jsonl> --run <run directory>

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sumCounts, usageCounts } from '../skills/savings/scripts/token-weights.mjs';

const USAGE = 'usage: design-run.mjs --transcript <session .jsonl> --run <run directory>';

// A checkpoint is a run-directory file whose name starts with the prefix, listed
// in the order a full redesign writes them.
const CHECKPOINTS = [
  'context.json',
  'contracts.json',
  'recommended.json',
  'contract-selected.json',
  'foundation.md',
  'renders/baseline-',
  'renders/post-build-',
  'faults.md',
  'renders/final-'
];

function parseArguments(argv) {
  const options = { transcript: null, run: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--transcript') options.transcript = value;
    else if (flag === '--run') options.run = value;
    else throw new Error(`unknown flag ${flag}; ${USAGE}`);
  }
  if (!options.transcript || !options.run) throw new Error(USAGE);
  return options;
}

function transcriptFiles(transcript) {
  const files = [transcript];
  const delegates = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(delegates)) return files;
  for (const name of fs.readdirSync(delegates).sort()) {
    if (name.endsWith('.jsonl')) files.push(path.join(delegates, name));
  }
  return files;
}

// One entry per response id, the last line winning, because a streaming
// response repeats its id with a growing output count.
function responses(transcript) {
  const byId = new Map();
  for (const file of transcriptFiles(transcript)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const message = entry?.message;
      if (entry?.type !== 'assistant' || !message?.id || !message.usage) continue;
      if (typeof entry.timestamp !== 'string') continue;
      byId.set(message.id, { atMs: Date.parse(entry.timestamp), counts: usageCounts(message.usage) });
    }
  }
  return [...byId.values()];
}

function runWindow(runDirectory) {
  const files = fs.readdirSync(runDirectory, { recursive: true })
    .map((name) => path.join(runDirectory, name))
    .filter((file) => fs.statSync(file).isFile());
  if (files.length === 0) throw new Error(`${runDirectory} holds no file, so it spans no run`);
  const times = files.map((file) => fs.statSync(file).mtimeMs);
  const earliestFileMs = Math.min(...times);
  const createdMs = fs.statSync(runDirectory).birthtimeMs;
  const startMs = createdMs > 0 ? Math.min(createdMs, earliestFileMs) : earliestFileMs;
  return { startMs, endMs: Math.max(...times) };
}

// The latest modification among the files one checkpoint prefix matches, or null.
function checkpointTime(runDirectory, prefix) {
  const directory = path.join(runDirectory, path.dirname(prefix));
  if (!fs.existsSync(directory)) return null;
  const stem = path.basename(prefix);
  const matching = fs.readdirSync(directory).filter((name) => name.startsWith(stem));
  if (matching.length === 0) return null;
  const times = matching.map((name) => fs.statSync(path.join(directory, name)).mtimeMs);
  return Math.max(...times);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const transcript = path.resolve(options.transcript);
  if (!fs.existsSync(transcript)) throw new Error(`no transcript at ${transcript}`);
  const runDirectory = path.resolve(options.run);
  if (!fs.existsSync(runDirectory)) throw new Error(`no run directory at ${runDirectory}`);
  const { startMs, endMs } = runWindow(runDirectory);
  const inside = [];
  const outside = [];
  for (const response of responses(transcript)) {
    if (response.atMs >= startMs && response.atMs <= endMs) inside.push(response.counts);
    else outside.push(response.counts);
  }
  if (inside.length === 0) {
    throw new Error(`no response in ${transcript} falls inside the run window of ${runDirectory}; pass the session that wrote that run`);
  }
  const marks = [];
  for (const prefix of CHECKPOINTS) {
    const time = checkpointTime(runDirectory, prefix);
    if (time !== null) marks.push({ checkpoint: prefix, atMs: Math.round(time - startMs) });
  }
  const report = {
    transcript,
    run: runDirectory,
    window: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    wallMs: Math.round(endMs - startMs),
    responses: inside.length,
    counts: sumCounts(inside),
    excluded: { responses: outside.length, counts: sumCounts(outside) },
    marks
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`design-run: ${error.message}`);
  process.exit(1);
}
