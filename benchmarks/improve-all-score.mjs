#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseFlags } from '#script-flags';
import { scoreOutDir } from './improve-speed.mjs';

const USAGE = 'Usage: node benchmarks/improve-all-score.mjs [--serial] [--from-replay <runs dir>] [--from-build <out dir>]';
const MAIN = { rounds: 1.857, verifyCost: 4.6, buildWall: 129.8, buildCost: 0.622 };
const FIX_RATE_FLOOR = 0.929;
const NEVER_CLEAN = 4;
const REPLAY_REPEAT = 2;
const REPLAY_ROUNDS = 3;
const BUILD_REPEAT = 10;
const BUILD_CONCURRENCY = 10;
const FAILED_CELL_PENALTY = 2;
const OUT_LINE = /^out (.+)$/m;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const variance = (values) => (values.length < 2 ? 0 : sum(values.map((value) => (value - mean(values)) ** 2)) / (values.length - 1));
const round3 = (value) => Math.round(value * 1000) / 1000;

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

function fixStatistic(cells) {
  const graded = cells.map((cell) => cell.list.filter((run) => run.grade).map((run) => run.grade.fixed / run.grade.planted)).filter((rates) => rates.length > 0);
  if (graded.length === 0) throw new GateFailure('no graded replay run');
  return {
    rate: mean(graded.map(mean)),
    sd: Math.sqrt(sum(graded.map((rates) => variance(rates) / rates.length))) / graded.length
  };
}

export function replayMeasures(directory) {
  const runs = readRuns(directory);
  const cells = [...Map.groupBy(runs, (run) => run.task)].map(([task, list]) => ({ task, list }));
  const fix = fixStatistic(cells);
  const falseFix = sum(runs.filter((run) => run.grade).map((run) => run.grade.falseFix));
  if (falseFix > 0) throw new GateFailure(`replay raised ${falseFix} false fix line(s)`);
  if (round3(fix.rate) < FIX_RATE_FLOOR - 2 * fix.sd) throw new GateFailure(`replay fix rate ${fix.rate.toFixed(3)} is below ${FIX_RATE_FLOOR} minus 2 sd ${(2 * fix.sd).toFixed(3)}`);
  const rounds = mean(cells.map((cell) => mean(cell.list.map((run) => run.roundsToClean ?? NEVER_CLEAN))));
  return { rounds, verifyCost: sum(runs.map((run) => run.costUsd)) };
}

function buildCell(directory, row) {
  const wall = readJson(path.join(directory, row.cell, 'record.json')).wallMs / 1000;
  return { cell: row.cell, reasons: row.failures, wall, cost: row.cost };
}

function requireBuildCells(cells, expected) {
  if (cells.length === 0) throw new GateFailure('build sweep failed: no cells');
  if (expected && cells.length < expected) throw new GateFailure(`build sweep failed: ${cells.length} of ${expected} cells recorded`);
  const unpriced = cells.filter((cell) => cell.cost === undefined && cell.reasons.length === 0);
  if (unpriced.length > 0) throw new GateFailure(`build sweep failed: no cost for ${unpriced.map((cell) => cell.cell).join(', ')}`);
}

function penalizedCosts(cells) {
  const known = cells.filter((cell) => cell.cost !== undefined).map((cell) => cell.cost);
  if (known.length === 0) throw new GateFailure('build sweep failed: no cell has a cost');
  return cells.map((cell) => {
    const base = cell.cost ?? Math.max(...known);
    return cell.reasons.length > 0 ? base * FAILED_CELL_PENALTY : base;
  });
}

export function buildMeasures(directory, expected) {
  const cells = scoreOutDir(directory).rows.map((row) => buildCell(directory, row));
  requireBuildCells(cells, expected);
  const walls = cells.map((cell) => (cell.reasons.length > 0 ? cell.wall * FAILED_CELL_PENALTY : cell.wall));
  const failedCells = cells.filter((cell) => cell.reasons.length > 0).map(({ cell, reasons }) => ({ cell, reasons }));
  return { buildWall: mean(walls), buildCost: mean(penalizedCosts(cells)), failedCells, cellCount: cells.length };
}

async function liveReplay(checkout, work) {
  const out = path.join(work, 'replay.md');
  const args = ['benchmarks/review-replay.mjs', '--checkout', checkout, '--rounds', String(REPLAY_ROUNDS), '--repeat', String(REPLAY_REPEAT), '--out', out];
  const finished = await runLogged(checkout, args, path.join(work, 'replay.log'));
  if (finished.status !== 0) throw new GateFailure(`review replay exited ${finished.status}\n${tail(finished.log)}`);
  return replayMeasures(`${out}.runs`);
}

async function liveBuild(checkout, work) {
  const args = ['benchmarks/improve-speed.mjs', checkout, '--measure', 'cost', '--repeat', String(BUILD_REPEAT), '--concurrency', String(BUILD_CONCURRENCY)];
  const finished = await runLogged(checkout, args, path.join(work, 'build.log'));
  const text = fs.readFileSync(finished.log, 'utf8');
  const out = text.match(OUT_LINE)?.[1];
  if (!out || !fs.existsSync(out)) throw new GateFailure(`build sweep produced no out directory (exit ${finished.status})\n${tail(finished.log)}`);
  return buildMeasures(out, BUILD_REPEAT);
}

async function measure(flags, checkout, work) {
  const replay = () => (flags['from-replay'] ? replayMeasures(path.resolve(flags['from-replay'])) : liveReplay(checkout, work));
  const build = () => (flags['from-build'] ? buildMeasures(path.resolve(flags['from-build'])) : liveBuild(checkout, work));
  if (flags.serial) return { ...(await replay()), ...(await build()) };
  const [replayResult, buildResult] = await Promise.allSettled([replay(), build()]);
  const failure = [replayResult, buildResult].find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return { ...replayResult.value, ...buildResult.value };
}

export function ratios(measured) {
  return [
    ['rounds', measured.rounds / MAIN.rounds],
    ['verify-cost', measured.verifyCost / MAIN.verifyCost],
    ['build-wall', measured.buildWall / MAIN.buildWall],
    ['build-cost', measured.buildCost / MAIN.buildCost]
  ];
}

export function geometricMean(values) {
  return Math.exp(mean(values.map(Math.log)));
}

function reportFailedCells(failedCells, total) {
  if (failedCells.length === 0) return;
  const details = failedCells.map(({ cell, reasons }) => `${cell} ${reasons.join(', ')}`).join('; ');
  console.error(`build failed ${failedCells.length} of ${total}: ${details}`);
}

async function main(argv) {
  const flags = parseFlags(argv, { serial: 'boolean', 'from-replay': 'value', 'from-build': 'value' }, { usage: USAGE });
  const checkout = path.resolve('.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-improve-all-'));
  try {
    const measured = await measure(flags, checkout, work);
    const parts = ratios(measured);
    reportFailedCells(measured.failedCells, measured.cellCount);
    for (const [id, ratio] of parts) console.log(`${id} ratio=${ratio.toFixed(3)}`);
    console.log(geometricMean(parts.map(([, ratio]) => ratio)).toFixed(3));
    fs.rmSync(work, { recursive: true, force: true });
    return 0;
  } catch (error) {
    console.error(`${error.message}\nkept ${work}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
