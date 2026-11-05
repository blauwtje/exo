#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { clusteredMeanCi } from '../lib/eval-stats.mjs';
import { findTranscript } from './cell-usage.mjs';
import { contextSeries } from '#context-series';
import { UsageError, isMain, parseFlags } from '#script-flags';
import { readJson, sum } from './basics.mjs';

const USAGE = `usage: node benchmarks/delegation-readout.mjs --check <out dir> [--run] [--dry-run]

Reads the paired value-tier cells of arms exo and exo-before from <out dir> and checks the pass rule of the
delegation-triggers spec: exo has a lower cost or a lower mean peak lead context than exo-before, no fewer passing
cells, and 0 Agent calls in every value-lean-minimal-diff cell. Each measure is judged by its paired diff per run and
task, clustered on task, and counts as lower or fewer only when the 95% CI of that diff lies below zero; the diff prints
with its CI, or with no SE when under two pairs or one task. Per cell it reads checks.json (pass),
result.json (cost, session id) and the main transcript (peak lead context, Agent calls; subagent transcripts are left out).
--check alone reads files and makes no model call.
--run first launches benchmarks/run.mjs for the 18 cells, capped at $25, with the main checkout as the before plugin.
--dry-run (with --check <out dir>) has run.mjs print the cells and the projected cost, starts no session and checks nothing.
A timed-out exo-before cell (checks.json timedOut) counts as a failed pass and leaves cost and peak, with its partner exo cell, which still counts its pass and Agent calls; the count of cells left out prints per line. A timed-out exo cell stops the readout, because its pass and Agent calls count.
Exit codes: 0 rule holds, 1 rule fails, a cell is missing or every run timed out, 2 bad flag.`;

const TASKS = ['value-web-research', 'value-rename-propagation', 'value-lean-minimal-diff'];
const LEAN_TASK = 'value-lean-minimal-diff';
const WEB_TASK = 'value-web-research';
const BEFORE = 'exo-before';
const ARMS = [BEFORE, 'exo'];
const RUNS = 3;
const MAX_TOTAL_USD = '25';
const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const RUN_SCRIPT = path.join(REPOSITORY, 'benchmarks', 'run.mjs');

export function mainCheckout(cwd = REPOSITORY) {
  const common = execFileSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.dirname(common);
}

export function runArguments({ out, beforePlugin, dryRun }) {
  return [
    '--tier', 'value',
    '--tasks', TASKS.join(','),
    '--arms', 'exo,exo-before',
    '--before-plugin', beforePlugin,
    '--model', 'sonnet',
    '--runs', String(RUNS),
    '--out', out,
    '--max-total-usd', MAX_TOTAL_USD,
    dryRun ? '--dry-run' : '--confirm'
  ];
}

function readCellJson(directory, name, label) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`${label}: no ${name}`);
  return readJson(file);
}

function leadStats(transcript) {
  const agentCalls = new Set();
  let peak = 0;
  for (const { tokens, entry } of contextSeries(transcript)) {
    peak = Math.max(peak, tokens ?? 0);
    const content = entry.type === 'assistant' && Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const block of content) if (block.type === 'tool_use' && block.name === 'Agent') agentCalls.add(block.id);
  }
  return { peak, agentCalls: agentCalls.size };
}

const cellDirectory = (out, { task, arm, run }) => path.join(out, task, arm, String(run));
const cellLabel = ({ task, arm, run }) => `${task} ${arm} #${run}`;

function readCell(out, cell, checks) {
  const result = readCellJson(cellDirectory(out, cell), 'result.json', cellLabel(cell));
  const transcript = findTranscript(String(result.session_id));
  if (transcript === null) throw new Error(`${cellLabel(cell)}: no transcript for session ${result.session_id}`);
  if (typeof result.total_cost_usd !== 'number') throw new Error(`${cellLabel(cell)}: no total_cost_usd in result.json`);
  return { ...cell, pass: checks.pass === true, paired: true, cost: result.total_cost_usd, ...leadStats(transcript) };
}

const timedOutCell = (cell) => ({ ...cell, pass: false, paired: false, cost: null, peak: null, agentCalls: 0 });

function readPair(out, { task, run }) {
  const cells = ARMS.map((arm) => ({ task, arm, run }));
  const checks = cells.map((cell) => readCellJson(cellDirectory(out, cell), 'checks.json', cellLabel(cell)));
  const slow = cells.filter((cell, index) => checks[index].timedOut === true);
  const lost = slow.find((cell) => cell.arm === 'exo');
  if (lost) throw new Error(`${cellLabel(lost)}: timed out, so its pass and Agent calls cannot be judged; rerun the cell`);
  if (slow.length === 0) return cells.map((cell, index) => readCell(out, cell, checks[index]));
  return cells.map((cell, index) => (slow.includes(cell) ? timedOutCell(cell) : { ...readCell(out, cell, checks[index]), paired: false }));
}

export function readCells(out) {
  const pairs = TASKS.flatMap((task) => Array.from({ length: RUNS }, (_, index) => ({ task, run: index + 1 })));
  const rows = pairs.flatMap((pair) => readPair(out, pair));
  if (!rows.some((row) => row.paired)) throw new Error('every run timed out: no pair left to judge');
  return { rows };
}

function summary(rows) {
  const measured = rows.filter((row) => row.paired);
  const empty = measured.length === 0;
  return { cells: rows.length, pass: rows.filter((row) => row.pass).length, excluded: rows.length - measured.length, cost: empty ? null : sum(measured.map((row) => row.cost)), meanPeak: empty ? null : Math.round(sum(measured.map((row) => row.peak)) / measured.length), agentCalls: sum(rows.map((row) => row.agentCalls)) };
}

function summaryLine(name, { cells, pass, excluded, cost, meanPeak, agentCalls }) {
  const left = excluded > 0 ? ` (${excluded} cells left out of cost and peak)` : '';
  return `${name} pass ${pass}/${cells} cost ${cost === null ? 'n/a' : `$${cost.toFixed(2)}`} mean peak ${meanPeak ?? 'n/a'} agent calls ${agentCalls}${left}`;
}

function change(after, before) {
  if (after === null || before === null || before === 0) return 'n/a';
  return `${(((after - before) / before) * 100).toFixed(1)}%`;
}

const inArm = (rows, arm, task) => rows.filter((row) => row.arm === arm && (task === undefined || row.task === task));

function pairsOf(rows) {
  const pairs = new Map();
  for (const row of rows) pairs.set(`${row.task} ${row.run}`, { ...pairs.get(`${row.task} ${row.run}`), task: row.task, [row.arm === 'exo' ? 'exo' : 'before']: row });
  return [...pairs.values()];
}

function pairedCi(pairs, value, measuredOnly) {
  const used = measuredOnly ? pairs.filter((pair) => pair.exo.paired) : pairs;
  if (used.length === 0) return null;
  return clusteredMeanCi(used.map((pair) => ({ cluster: pair.task, value: value(pair.exo) - value(pair.before) })));
}

const clearsBelowZero = (ci) => ci !== null && ci.hi !== null && ci.hi < 0;

function ciText(ci, format) {
  if (ci === null) return 'n/a';
  const base = `${format(ci.mean)}`;
  if (ci.se === null) return `${base}, no SE (${ci.n} pairs)`;
  return `${base} ±${format(ci.hi - ci.mean)} (95% CI, ${ci.n} pairs, ${ci.clusters} tasks)`;
}

const dollars = (value) => `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`;
const whole = (value) => String(Math.round(value));
const passes = (value) => value.toFixed(2);

function readoutLines(rows, { exo, before, cost, peak, pass, costLower, peakLower }) {
  const webFailed = rows.filter((row) => row.task === WEB_TASK && !row.pass).length;
  const lines = [
    ...TASKS.filter((task) => inArm(rows, 'exo', task).length > 0).flatMap((task) => ARMS.map((arm) => summaryLine(`${task} ${arm}`, summary(inArm(rows, arm, task))))),
    summaryLine(`arm ${BEFORE}`, before),
    summaryLine('arm exo', exo),
    `delta cost ${change(exo.cost, before.cost)} peak ${change(exo.meanPeak, before.meanPeak)}`,
    `paired cost diff exo minus ${BEFORE}: ${ciText(cost, dollars)}`,
    `paired peak diff exo minus ${BEFORE}: ${ciText(peak, whole)}`,
    `paired pass diff exo minus ${BEFORE}: ${ciText(pass, passes)}`,
    `cost lower ${costLower ? 'yes' : 'no'} peak lower ${peakLower ? 'yes' : 'no'} (yes only when the 95% CI of the paired diff lies below zero; n=${RUNS} per arm and task: one measure alone is thin)`
  ];
  if (webFailed > 0) lines.push(`web-research failed in ${webFailed} cells: a harness problem, not a verdict`);
  return lines;
}

function readoutProblems(rows, { exo, before, pass, costLower, peakLower }) {
  const leanCalls = sum(inArm(rows, 'exo', LEAN_TASK).map((row) => row.agentCalls));
  const problems = [];
  if (!costLower && !peakLower) problems.push(`exo is not lower in cost or mean peak than ${BEFORE}`);
  if (clearsBelowZero(pass)) problems.push(`exo pass ${exo.pass}/${exo.cells} against ${before.pass}/${before.cells} for ${BEFORE}`);
  if (leanCalls > 0) problems.push(`${leanCalls} Agent calls in ${LEAN_TASK} cells of exo`);
  return problems;
}

export function readout(rows) {
  const pairs = pairsOf(rows);
  const cost = pairedCi(pairs, (row) => row.cost, true);
  const peak = pairedCi(pairs, (row) => row.peak, true);
  const pass = pairedCi(pairs, (row) => (row.pass ? 1 : 0), false);
  const verdict = { exo: summary(inArm(rows, 'exo')), before: summary(inArm(rows, BEFORE)), cost, peak, pass, costLower: clearsBelowZero(cost), peakLower: clearsBelowZero(peak) };
  return { lines: readoutLines(rows, verdict), problems: readoutProblems(rows, verdict) };
}

function launch(argv) {
  const { status } = spawnSync(process.execPath, [RUN_SCRIPT, ...argv], { stdio: 'inherit' });
  if (status !== 0) throw new Error(`benchmarks/run.mjs exited ${status}`);
}

function main(argv) {
  const flags = parseFlags(argv, { check: 'string', run: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  for (const flag of ['run', 'dry-run']) {
    if (flags[flag] && flags.check === undefined) throw new UsageError(`--${flag} needs --check <out dir>`);
  }
  if (flags.check === undefined) throw new UsageError('name --check <out dir>');
  if (flags['dry-run']) return launch(runArguments({ out: flags.check, beforePlugin: mainCheckout(), dryRun: true }));
  if (flags.run) launch(runArguments({ out: flags.check, beforePlugin: mainCheckout(), dryRun: false }));
  const { rows } = readCells(flags.check);
  const { lines, problems } = readout(rows);
  console.log(lines.join('\n'));
  if (problems.length === 0) return;
  console.error(`delegation-readout: ${problems.join('; ')}`);
  process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? `${error.message}\n${USAGE}` : `delegation-readout: ${error.message}`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
