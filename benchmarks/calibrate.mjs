#!/usr/bin/env node
// benchmarks/calibrate.mjs
// Checks the overhead booking against measurement. On the calibration tier no
// skill should fire, so an exo cell differs from a baseline cell by exo's
// overhead alone: the measured difference of the arm means, with its
// standard error, sits beside the mean of what overhead.mjs books from each
// exo cell's own transcript, read again with the guard entries of that cell's
// ledger. Time is the cell's whole process (checks.json wallMs), because
// duration_ms starts after the SessionStart hook the booking counts.
//
//   node benchmarks/calibrate.mjs benchmarks/runs/<dir> [--results <file>]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { emptySession, readJson } from '../skills/savings/scripts/ledger.mjs';
import { overheadTotals } from '../skills/savings/scripts/overhead.mjs';
import { sumCounts, usageCounts } from '../skills/savings/scripts/token-weights.mjs';
import { findTranscript, ingestTranscript } from '../skills/savings/scripts/transcript.mjs';
import { meanAndSd } from './statistics.mjs';

const FORMAT = {
  tokens: (value) => value.toFixed(0),
  cost: (value) => `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(4)}`,
  time: (value) => `${value.toFixed(0)} ms`
};

function calibrationCells(directory) {
  const cells = [];
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (path.basename(file) !== 'checks.json') continue;
    const cellDirectory = path.join(directory, path.dirname(file));
    const checks = readJson(path.join(cellDirectory, 'checks.json'), null);
    const result = readJson(path.join(cellDirectory, 'result.json'), null);
    if (checks?.tier === 'calibration' && result !== null) cells.push({ arm: checks.arm, cellDirectory, checks, result });
  }
  return cells;
}

function measured(cell) {
  const counts = sumCounts([usageCounts(cell.result.usage ?? {})]);
  return { tokens: counts.weightedInput + counts.output, cost: cell.result.total_cost_usd, time: cell.checks.wallMs };
}

function booked(cell) {
  const sessionId = cell.result.session_id;
  const transcript = findTranscript(sessionId);
  if (transcript === null) throw new Error(`no transcript for session ${sessionId} under the Claude config directory`);
  const cellLedger = readJson(path.join(cell.cellDirectory, 'ledger', 'sessions.json'), {});
  const session = emptySession();
  session.guard = cellLedger[sessionId]?.guard ?? session.guard;
  ingestTranscript(session, transcript);
  const wholeCalls = Object.values(session.overhead.calls).filter((call) => !call.mixed);
  return { ...overheadTotals(session), wholeCalls: wholeCalls.length };
}

function comparisonRow(metric, baseline, exo, bookings) {
  const format = FORMAT[metric];
  const exoStat = meanAndSd(exo.map((row) => row[metric]));
  const baselineStat = meanAndSd(baseline.map((row) => row[metric]));
  const difference = exoStat.mean - baselineStat.mean;
  const spread = Math.sqrt(exoStat.sd ** 2 / exoStat.n + baselineStat.sd ** 2 / baselineStat.n);
  const bookedValues = bookings.map((booking) => booking[metric]);
  if (bookedValues.includes(null)) return `| ${metric} | ${format(difference)} ± ${format(spread)} | unknown | - | - |`;
  const bookedMean = meanAndSd(bookedValues).mean;
  const error = bookedMean - difference;
  return `| ${metric} | ${format(difference)} ± ${format(spread)} | ${format(bookedMean)} | ${format(error)} | ${Math.abs(error) <= spread ? 'yes' : 'no'} |`;
}

function main() {
  const [directory, flag, resultsFile] = process.argv.slice(2);
  const validFlag = flag === undefined || (flag === '--results' && resultsFile !== undefined);
  if (directory === undefined || !validFlag) throw new Error('usage: calibrate.mjs <runs directory> [--results <file>]');
  const cells = calibrationCells(path.resolve(directory));
  const baselineCells = cells.filter((cell) => cell.arm === 'baseline');
  const exoCells = cells.filter((cell) => cell.arm === 'exo');
  if (baselineCells.length < 2 || exoCells.length < 2) throw new Error('needs at least two calibration cells in both the baseline and the exo arm');
  const baseline = baselineCells.map(measured);
  const exo = exoCells.map(measured);
  const bookings = exoCells.map(booked);
  const wholeCalls = bookings.reduce((sum, booking) => sum + booking.wholeCalls, 0);
  const lines = [
    `Calibration: ${exoCells.length} exo and ${baselineCells.length} baseline cells; calls counted whole: ${wholeCalls}.`,
    '',
    '| metric | measured Δ ± se | booked | error | within spread |',
    '|---|---|---|---|---|',
    ...Object.keys(FORMAT).map((metric) => comparisonRow(metric, baseline, exo, bookings))
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  if (resultsFile === undefined) return;
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  fs.writeFileSync(resultsFile, `# Overhead calibration\n\nWhat \`node benchmarks/calibrate.mjs\` printed for \`${path.basename(path.resolve(directory))}\`.\n\n${lines.join('\n')}\n`);
}

try {
  main();
} catch (error) {
  console.error(`calibrate: ${error.message}`);
  process.exit(1);
}
