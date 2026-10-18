#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { classify, readTrials, trialCost, trialCounts, trialTask, trialWallMs } from './job.mjs';

const CLAUDE_VERSION = '2.1.302';
const DATASET = 'terminal-bench-2-1';

function cellOf(trial, arm) {
  if (!trial.result) return null;
  const verdict = classify(trial);
  return verdict.kind === 'cancelled' ? null : { trial, arm, task: trialTask(trial.result), verdict };
}

export function importJobs({ jobs, out, model, control = 'exo-before', date = new Date().toISOString().slice(0, 10) }) {
  const cells = jobs.flatMap(({ directory, arm }) => readTrials(directory).map((trial) => cellOf(trial, arm)).filter(Boolean));
  const dropped = new Set(cells.filter((cell) => cell.arm === control && cell.verdict.kind === 'infra').map((cell) => cell.task));
  const kept = cells.filter((cell) => !dropped.has(cell.task));
  const runs = new Map();
  for (const cell of kept) {
    const key = `${cell.task}/${cell.arm}`;
    runs.set(key, (runs.get(key) ?? 0) + 1);
    cell.run = runs.get(key);
    writeCell(out, cell);
  }
  const meta = {
    model,
    claudeVersion: CLAUDE_VERSION,
    fixture: { name: DATASET, commit: 'harbor' },
    runs: Math.max(0, ...runs.values()),
    date,
    arms: [...new Set(jobs.map((job) => job.arm))],
    tasks: [...new Set(kept.map((cell) => cell.task))].sort(),
    cells: kept.length,
    mode: 'terminal-bench',
    infra: kept.filter((cell) => cell.verdict.kind === 'infra').length,
    droppedTasks: [...dropped].sort()
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

function writeCell(out, { trial, arm, task, run, verdict }) {
  const directory = path.join(out, task, arm, String(run));
  fs.mkdirSync(directory, { recursive: true });
  const wallMs = trialWallMs(trial.result);
  const checks = { tier: 'value', pass: verdict.kind === 'pass', defects: 0, loc: { added: 0 }, wallMs, verdict: verdict.reason ?? verdict.kind };
  if (verdict.kind === 'infra') checks.harnessError = verdict.reason;
  if (verdict.timedOut) checks.timedOut = true;
  if (verdict.maxTurns) checks.maxTurns = true;
  const write = (name, value) => fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
  write('checks.json', checks);
  write('result.json', { total_cost_usd: trialCost(trial), duration_ms: wallMs, trial: trial.name });
  const counts = trialCounts(trial);
  if (counts) write('usage.json', { transcript: null, counts, byModel: {}, subagents: [], leadPeakTokens: null });
}

function parseJob(value) {
  const [directory, arm] = String(value).split('=');
  if (!(directory && arm)) throw new Error('--job takes <job dir>=<arm>');
  return { directory, arm };
}

function parse(argv) {
  const options = { jobs: [], out: null, model: null, control: 'exo-before' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--job') options.jobs.push(parseJob(argv[++index]));
    else if (flag === '--out') options.out = argv[++index];
    else if (flag === '--model') options.model = argv[++index];
    else if (flag === '--control') options.control = argv[++index];
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!options.out || !options.model || options.jobs.length === 0) {
    throw new Error('usage: import.mjs --out <runs dir> --model <id> --job <job dir>=<arm> [--job ...] [--control exo-before]');
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parse(process.argv.slice(2));
    const meta = importJobs(options);
    process.stdout.write(`imported ${meta.cells} cells (${meta.infra} infra) for ${meta.tasks.length} tasks into ${options.out}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
