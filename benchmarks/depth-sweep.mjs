import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJsonOrNull } from './basics.mjs';
import { ARMS, resultsText } from './depth-sweep-results.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function parseDepthArguments(argv) {
  const options = { pilot: false, repeat: null, capUsd: null, results: null, arms: ARMS, concurrency: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--pilot') options.pilot = true;
    else if (flag === '--repeat') options.repeat = Number(argv[++index]);
    else if (flag === '--cap-usd') options.capUsd = Number(argv[++index]);
    else if (flag === '--results') options.results = argv[++index];
    else if (flag === '--arms') options.arms = argv[++index].split(',');
    else if (flag === '--concurrency') options.concurrency = Number(argv[++index]);
    else throw new Error(`unknown flag ${flag}`);
  }
  const unknownArm = options.arms.find((arm) => !ARMS.includes(arm));
  if (unknownArm !== undefined) throw new Error(`--arms names unknown arm ${unknownArm}`);
  options.concurrency ??= options.arms.length;
  if (!Number.isInteger(options.repeat) || options.repeat < 1) throw new Error('--repeat must be a positive integer');
  if (!Number.isFinite(options.capUsd) || options.capUsd <= 0) throw new Error('--cap-usd must be a positive number');
  if (options.results === null) throw new Error('--results needs a path');
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error('--concurrency must be a positive integer');
  return options;
}

function readRecords(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
  return lines.map((line) => JSON.parse(line));
}

export function projectedCostUsd({ pilots, repeat, arms }) {
  const perRun = pilots.reduce((sum, run) => sum + run.costUsd, 0) / pilots.length;
  return perRun * repeat * arms.length;
}

const runName = (run) => `${run.arm}-${run.index}`;

const unknownCostRun = (runs) => runs.find((run) => !Number.isFinite(run.costUsd));

const spentUsd = (records) => records.reduce((sum, run) => sum + run.costUsd, 0);

function stopReason(records, capUsd) {
  const unknown = unknownCostRun(records);
  if (unknown !== undefined) return `Stopped: run ${runName(unknown)} has no finite costUsd.`;
  return spentUsd(records) >= capUsd ? 'Stopped at the cost cap.' : null;
}

const missingArms = (records, arms, index) => arms.filter((arm) => !records.some((run) => run.arm === arm && run.index === index));

function keepRound({ arms, index, found, state, recordsFile }) {
  const runs = arms.filter((arm) => found[arm] != null).map((arm) => ({ arm, index, ...found[arm] }));
  state.records.push(...runs);
  for (const run of runs) fs.appendFileSync(recordsFile, `${JSON.stringify(run)}\n`);
  const lost = arms.find((arm) => found[arm] == null);
  if (lost !== undefined) throw new Error(`${lost} run ${index} left no record`);
}

async function runMissing({ arms, count, options, state, runRound }) {
  const recordsFile = `${options.results}.runs.jsonl`;
  for (let index = 1; index <= count; index += 1) {
    const missing = missingArms(state.records, arms, index);
    if (missing.length === 0) continue;
    state.stopReason = stopReason(state.records, options.capUsd);
    if (state.stopReason !== null) return;
    const found = await runRound({ arms: missing, index });
    keepRound({ arms: missing, index, found, state, recordsFile });
  }
}

export async function depthSweep({ options, runRound }) {
  fs.mkdirSync(path.dirname(path.resolve(options.results)), { recursive: true });
  const { arms = ARMS } = options;
  const state = { records: readRecords(`${options.results}.runs.jsonl`), stopReason: null };
  if (options.pilot) {
    await runMissing({ arms, count: 1, options, state, runRound });
    const pilots = state.records.filter((run) => run.index === 1 && arms.includes(run.arm));
    const unknown = unknownCostRun(pilots);
    if (unknown !== undefined) return { refused: true, reason: `pilot run ${runName(unknown)} has no finite costUsd` };
    const projected = projectedCostUsd({ pilots, repeat: options.repeat, arms });
    if (projected > options.capUsd) return { refused: true, reason: `projected $${projected.toFixed(2)} is over the $${options.capUsd} cap` };
  }
  await runMissing({ arms, count: options.repeat, options, state, runRound });
  state.stopReason ??= stopReason(state.records, options.capUsd);
  fs.writeFileSync(options.results, resultsText({ ...state, arms }));
  return { refused: false, records: state.records, stopReason: state.stopReason };
}

const roundDirectory = (runsDirectory, index) => path.join(runsDirectory, `round-${index}`);

export function roundArguments({ arms, index, concurrency, runsDirectory }) {
  const out = roundDirectory(runsDirectory, index);
  return ['benchmarks/sweep.mjs', '--set', 'flow', '--cells', arms.join(','), '--concurrency', String(concurrency), '--confirm', '--out', out, '--results', path.join(out, 'published')];
}

function sweepRunner(options) {
  const runsDirectory = `${path.resolve(options.results)}.runs`;
  return ({ arms, index }) => new Promise((resolve, reject) => {
    const out = roundDirectory(runsDirectory, index);
    const args = roundArguments({ arms, index, concurrency: options.concurrency, runsDirectory });
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', () => resolve(Object.fromEntries(arms.map((arm) => [arm, readJsonOrNull(path.join(out, arm, 'record.json'))]))));
  });
}

async function main() {
  const options = parseDepthArguments(process.argv.slice(2));
  const outcome = await depthSweep({ options, runRound: sweepRunner(options) });
  if (outcome.refused) {
    console.error(`depth-sweep: ${outcome.reason}`);
    process.exitCode = 1;
    return;
  }
  if (outcome.stopReason !== null) console.error(`depth-sweep: ${outcome.stopReason}`);
  console.log(`wrote ${options.results}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`depth-sweep: ${error.message}`);
    process.exitCode = 1;
  });
}
