#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags } from '#script-flags';
import { clusteredMeanCi } from '../lib/eval-stats.mjs';
import { scoreOutDir } from './improve-speed.mjs';
import { readJson, mean, sum } from './basics.mjs';

const USAGE = 'Usage: node benchmarks/improve-all-score.mjs [--full] [--dry-run] [--serial] [--from-replay <runs dir>] [--from-build <out dir>]';
const MAIN = { rounds: 1.857, verifyCost: 4.6, buildWall: 294.9487, buildCost: 0.95046258 };
const MAIN_FIX_RATE = { mean: 0.841, sd: 0.049 };
const FIX_RATE_SIGMAS = 3;
const FIX_RATE_FLOOR = Math.floor((MAIN_FIX_RATE.mean - FIX_RATE_SIGMAS * MAIN_FIX_RATE.sd) * 100) / 100;
const NEVER_CLEAN = 4;
const REPLAY_ROUNDS = 3;
const TIERS = {
  quick: { name: 'quick', replayRepeat: 1, buildRepeat: 3 },
  full: { name: 'full', replayRepeat: 2, buildRepeat: 10 }
};
const MAIN_REPLAY_REPEAT = TIERS.full.replayRepeat;
const BUILD_CONCURRENCY = 10;
const FAILED_CELL_PENALTY = 2;
const ABORTED_REASONS = new Set(['timed out', 'exit code not 0']);
const SAMPLE_KEYS = { rounds: 'rounds', 'verify-cost': 'verifyCost', 'build-wall': 'buildWall', 'build-cost': 'buildCost' };
const OUT_LINE = /^out (.+)$/m;


class GateFailure extends Error {}

function runLogged(checkout, args, logFile) {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logFile, 'w');
    const child = spawn(process.execPath, args, { cwd: checkout, stdio: ['ignore', log, log] });
    child.on('error', reject);
    child.on('close', (status) => {
      fs.closeSync(log);
      resolve({ status, log: logFile });
    });
  });
}

function tail(file, lines = 12) {
  return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
}

function readRuns(directory) {
  const names = fs.readdirSync(directory).sort().filter((name) => fs.existsSync(path.join(directory, name, 'run.json')));
  if (names.length === 0) throw new GateFailure(`no replay run records in ${directory}`);
  return names.map((name) => ({ task: name.replace(/-[^-]+$/, ''), ...readJson(path.join(directory, name, 'run.json')) }));
}

function fixRate(cells) {
  const graded = cells.map((cell) => cell.list.filter((run) => run.grade).map((run) => run.grade.fixed / run.grade.planted)).filter((rates) => rates.length > 0);
  if (graded.length === 0) throw new GateFailure('no graded replay run');
  return mean(graded.map(mean));
}

const raisedFalseFix = (run) => (run.grade?.falseFix ?? 0) > 0;
const roundsScored = (run) => (raisedFalseFix(run) ? NEVER_CLEAN : (run.roundsToClean ?? NEVER_CLEAN));

function pricedRuns(runs) {
  const priced = runs.filter((run) => Number.isFinite(run.costUsd));
  if (priced.length === 0) throw new GateFailure('no replay run has a cost');
  return priced;
}

const meanCost = (runs) => mean(runs.map((run) => run.costUsd));

function taskMeasures(cells, runCount) {
  return cells.map((cell) => ({ task: cell.task, list: cell.list.filter((run) => Number.isFinite(run.costUsd)), rounds: mean(cell.list.map(roundsScored)) }))
    .filter((cell) => cell.list.length > 0)
    .map((cell) => ({ task: cell.task, rounds: cell.rounds, verifyCost: meanCost(cell.list) * runCount }));
}

export function replayMeasures(directory) {
  const runs = readRuns(directory);
  const cells = [...Map.groupBy(runs, (run) => run.task)].map(([task, list]) => ({ task, list }));
  const rate = fixRate(cells);
  if (rate < FIX_RATE_FLOOR) throw new GateFailure(`replay fix rate ${rate.toFixed(3)} is below the floor ${FIX_RATE_FLOOR}: main ${MAIN_FIX_RATE.mean} minus ${FIX_RATE_SIGMAS} sd ${MAIN_FIX_RATE.sd}`);
  const rounds = mean(cells.map((cell) => mean(cell.list.map(roundsScored))));
  const priced = pricedRuns(runs);
  const verifyCost = meanCost(priced) * runs.length;
  const samples = {
    rounds: runs.map((run) => ({ cluster: run.task, value: roundsScored(run) })),
    verifyCost: priced.map((run) => ({ cluster: run.task, value: run.costUsd * runs.length }))
  };
  const excluded = { rounds: 0, verifyCost: runs.length - priced.length };
  return { rounds, verifyCost, falseFixRuns: runs.filter(raisedFalseFix).length, runCount: runs.length, replayRepeat: Math.max(...cells.map((cell) => cell.list.length)), tasks: taskMeasures(cells, runs.length), samples, excluded };
}

function buildCell(directory, row) {
  const { wallMs } = readJson(path.join(directory, row.cell, 'record.json'));
  return { cell: row.cell, reasons: row.failures, wall: Number.isFinite(wallMs) ? wallMs / 1000 : null, cost: row.cost };
}

function requireBuildCells(cells, expected) {
  if (cells.length === 0) throw new GateFailure('build sweep failed: no cells');
  if (expected && cells.length < expected) throw new GateFailure(`build sweep failed: ${cells.length} of ${expected} cells recorded`);
  const unpriced = cells.filter((cell) => cell.cost === undefined && cell.reasons.length === 0);
  if (unpriced.length > 0) throw new GateFailure(`build sweep failed: no cost for ${unpriced.map((cell) => cell.cell).join(', ')}`);
}

function requireNoAbortedCells(cells) {
  const aborted = cells.filter((cell) => cell.reasons.some((reason) => ABORTED_REASONS.has(reason)));
  if (aborted.length > 0) throw new GateFailure(`build sweep failed: ${aborted.length} of ${cells.length} cells aborted: ${aborted.map((cell) => `${cell.cell} ${cell.reasons.join(', ')}`).join('; ')}`);
}

function penalised(cell, value) {
  return cell.reasons.length > 0 ? value * FAILED_CELL_PENALTY : value;
}

function measuredValues(cells, field, name) {
  const measured = cells.filter((cell) => cell[field] !== null && cell[field] !== undefined);
  if (measured.length === 0) throw new GateFailure(`build sweep failed: no cell has a ${name}`);
  return { rows: measured.map((cell) => ({ cluster: cell.cell, value: penalised(cell, cell[field]) })), excluded: cells.length - measured.length };
}

export function buildMeasures(directory, expected) {
  const cells = scoreOutDir(directory).rows.map((row) => buildCell(directory, row));
  requireBuildCells(cells, expected);
  requireNoAbortedCells(cells);
  const wall = measuredValues(cells, 'wall', 'wall time');
  const cost = measuredValues(cells, 'cost', 'cost');
  const failedCells = cells.filter((cell) => cell.reasons.length > 0).map(({ cell, reasons }) => ({ cell, reasons }));
  const meanOf = (rows) => mean(rows.map((row) => row.value));
  return {
    buildWall: meanOf(wall.rows), buildCost: meanOf(cost.rows), failedCells, cellCount: cells.length,
    buildSamples: { buildWall: wall.rows, buildCost: cost.rows }, buildExcluded: { buildWall: wall.excluded, buildCost: cost.excluded }
  };
}

export const tierFor = (flags) => (flags.full ? TIERS.full : TIERS.quick);

const mainVerifyCost = (replayRepeat) => (MAIN.verifyCost * replayRepeat) / MAIN_REPLAY_REPEAT;
export const projectedUsd = (tier) => mainVerifyCost(tier.replayRepeat) + MAIN.buildCost * tier.buildRepeat;

const replayArgs = (checkout, tier, out) => ['benchmarks/review-replay.mjs', '--checkout', checkout, '--rounds', String(REPLAY_ROUNDS), '--repeat', String(tier.replayRepeat), '--out', out];
const buildArgs = (checkout, tier) => ['benchmarks/improve-speed.mjs', checkout, '--measure', 'cost', '--repeat', String(tier.buildRepeat), '--concurrency', String(BUILD_CONCURRENCY)];

function printDryRun(checkout, tier) {
  console.log(`tier ${tier.name}`);
  console.log(`node ${replayArgs(checkout, tier, '<work>/replay.md').join(' ')}`);
  console.log(`node ${buildArgs(checkout, tier).join(' ')}`);
  console.log(`projected usd ${projectedUsd(tier).toFixed(2)}`);
}

async function liveReplay(checkout, work, tier) {
  const out = path.join(work, 'replay.md');
  const args = replayArgs(checkout, tier, out);
  const finished = await runLogged(checkout, args, path.join(work, 'replay.log'));
  if (finished.status !== 0) throw new GateFailure(`review replay exited ${finished.status}\n${tail(finished.log)}`);
  return replayMeasures(`${out}.runs`);
}

async function liveBuild(checkout, work, tier) {
  const args = buildArgs(checkout, tier);
  const finished = await runLogged(checkout, args, path.join(work, 'build.log'));
  const text = fs.readFileSync(finished.log, 'utf8');
  const out = text.match(OUT_LINE)?.[1];
  if (!out || !fs.existsSync(out)) throw new GateFailure(`build sweep produced no out directory (exit ${finished.status})\n${tail(finished.log)}`);
  return buildMeasures(out, tier.buildRepeat);
}

async function measure(flags, checkout, work) {
  const tier = tierFor(flags);
  const replay = () => (flags['from-replay'] ? replayMeasures(path.resolve(flags['from-replay'])) : liveReplay(checkout, work, tier));
  const build = () => (flags['from-build'] ? buildMeasures(path.resolve(flags['from-build'])) : liveBuild(checkout, work, tier));
  if (flags.serial) return { ...(await replay()), ...(await build()) };
  const [replayResult, buildResult] = await Promise.allSettled([replay(), build()]);
  const failure = [replayResult, buildResult].find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return { ...replayResult.value, ...buildResult.value };
}

export function ratios(measured, tier) {
  return [
    ['rounds', measured.rounds / MAIN.rounds],
    ['verify-cost', measured.verifyCost / mainVerifyCost(measured.replayRepeat ?? tier.replayRepeat)],
    ['build-wall', measured.buildWall / MAIN.buildWall],
    ['build-cost', measured.buildCost / MAIN.buildCost]
  ];
}

export function ratioStats(measured, tier) {
  return ratios(measured, tier).map(([id, ratio]) => {
    const key = SAMPLE_KEYS[id];
    const rows = { ...measured.samples, ...measured.buildSamples }[key] ?? [];
    const excluded = { ...measured.excluded, ...measured.buildExcluded }[key] ?? 0;
    if (rows.length === 0) return { id, ratio, se: null, n: 0, excluded };
    const ci = clusteredMeanCi(rows);
    return { id, ratio, se: ci.se === null || ci.mean === 0 ? null : (ratio * ci.se) / ci.mean, n: ci.n, excluded };
  });
}

export function scoreSe(stats) {
  if (stats.some((stat) => stat.se === null)) return null;
  const score = geometricMean(stats.map((stat) => stat.ratio));
  return (score * Math.sqrt(sum(stats.map((stat) => (stat.se / stat.ratio) ** 2)))) / stats.length;
}

export function taskItems(measured, tier) {
  const buildRatios = ratios(measured, tier).filter(([id]) => id.startsWith('build')).map(([, ratio]) => ratio);
  const verifyMain = mainVerifyCost(measured.replayRepeat ?? tier.replayRepeat);
  return (measured.tasks ?? []).map((task) => [task.task.replace(/\s+/g, '-'), geometricMean([task.rounds / MAIN.rounds, task.verifyCost / verifyMain, ...buildRatios])]);
}

export function geometricMean(values) {
  return Math.exp(mean(values.map(Math.log)));
}

function reportFailedCells(failedCells, total) {
  if (failedCells.length === 0) return;
  const details = failedCells.map(({ cell, reasons }) => `${cell} ${reasons.join(', ')}`).join('; ');
  console.error(`build failed ${failedCells.length} of ${total}: ${details}`);
}

function reportFalseFix(falseFixRuns, total) {
  if (falseFixRuns === 0) return;
  console.error(`replay false fix ${falseFixRuns} of ${total}`);
}

const spread = (stat) => (stat.se === null ? 'no SE' : `se=${stat.se.toFixed(3)} n=${stat.n}`);

export const statLine = (stat, tier) => `${stat.id} ratio=${stat.ratio.toFixed(3)} ${spread(stat)} excluded=${stat.excluded}${tier.name === 'quick' ? ' quick' : ''}`;

export function scoreLine(stats) {
  const se = scoreSe(stats);
  return se === null ? 'score no SE' : `score se=${se.toFixed(3)}`;
}

async function main(argv) {
  const flags = parseFlags(argv, { full: 'boolean', 'dry-run': 'boolean', serial: 'boolean', 'from-replay': 'value', 'from-build': 'value' }, { usage: USAGE });
  const checkout = path.resolve('.');
  const tier = tierFor(flags);
  if (flags['dry-run']) {
    printDryRun(checkout, tier);
    return 0;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-improve-all-'));
  try {
    const measured = await measure(flags, checkout, work);
    const stats = ratioStats(measured, tier);
    reportFalseFix(measured.falseFixRuns, measured.runCount);
    reportFailedCells(measured.failedCells, measured.cellCount);
    for (const stat of stats) console.log(statLine(stat, tier));
    console.log(scoreLine(stats));
    for (const [task, value] of taskItems(measured, tier)) console.log(`ITEM ${task} ${value.toFixed(4)}`);
    console.log(geometricMean(stats.map((stat) => stat.ratio)).toFixed(3));
    fs.rmSync(work, { recursive: true, force: true });
    return 0;
  } catch (error) {
    console.error(`${error.message}\nkept ${work}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
