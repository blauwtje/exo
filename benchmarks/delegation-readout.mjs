#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { findTranscript } from './cell-usage.mjs';
import { contextSeries } from '#context-limits';
import { UsageError, isMain, parseFlags } from '#script-flags';

const USAGE = `usage: node benchmarks/delegation-readout.mjs --check <out dir> [--run] [--dry-run]

Reads the paired value-tier cells of arms exo and exo-before from <out dir> and checks the pass rule of the
delegation-triggers spec: exo has a lower summed cost or a lower mean peak lead context than exo-before, at least as
many passing cells, and 0 Agent calls in every value-lean-minimal-diff cell. Per cell it reads checks.json (pass),
result.json (cost, session id) and the main transcript (peak lead context, Agent calls; subagent transcripts are left out).
--check alone reads files and makes no model call.
--run first launches benchmarks/run.mjs for the 18 cells, capped at $25, with the main checkout as the before plugin.
--dry-run (with --check <out dir>) has run.mjs print the cells and the projected cost, starts no session and checks nothing.
A run whose exo-before cell timed out (checks.json timedOut) is dropped from both arms with one DROPPED line and the rule is judged over the remaining pairs; a timed-out exo cell stops the readout, because its pass and Agent calls count; the exo cell of a dropped run still counts its Agent calls.
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

function readJson(directory, name, label) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`${label}: no ${name}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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
  const result = readJson(cellDirectory(out, cell), 'result.json', cellLabel(cell));
  const transcript = findTranscript(String(result.session_id));
  if (transcript === null) throw new Error(`${cellLabel(cell)}: no transcript for session ${result.session_id}`);
  if (typeof result.total_cost_usd !== 'number') throw new Error(`${cellLabel(cell)}: no total_cost_usd in result.json`);
  return { ...cell, pass: checks.pass === true, cost: result.total_cost_usd, ...leadStats(transcript) };
}

function readPair(out, { task, run }) {
  const cells = ARMS.map((arm) => ({ task, arm, run }));
  const checks = cells.map((cell) => readJson(cellDirectory(out, cell), 'checks.json', cellLabel(cell)));
  const slow = cells.filter((cell, index) => checks[index].timedOut === true);
  const lost = slow.find((cell) => cell.arm === 'exo');
  if (lost) throw new Error(`${cellLabel(lost)}: timed out, so its pass and Agent calls cannot be judged; rerun the cell`);
  if (slow.length > 0) {
    const exo = cells.find((cell) => cell.arm === 'exo');
    return { dropped: `DROPPED ${task} run ${run}: timeout in ${slow.map((cell) => cell.arm).join(', ')}`, droppedExo: readCell(out, exo, checks[cells.indexOf(exo)]) };
  }
  return { rows: cells.map((cell, index) => readCell(out, cell, checks[index])) };
}

export function readCells(out) {
  const pairs = TASKS.flatMap((task) => Array.from({ length: RUNS }, (_, index) => ({ task, run: index + 1 })));
  const read = pairs.map((pair) => readPair(out, pair));
  const rows = read.flatMap((pair) => pair.rows ?? []);
  if (rows.length === 0) throw new Error('every run timed out: no pair left to judge');
  return { rows, dropped: read.flatMap((pair) => pair.dropped ?? []), droppedExo: read.flatMap((pair) => pair.droppedExo ?? []) };
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

function summary(rows) {
  return { cells: rows.length, pass: rows.filter((row) => row.pass).length, cost: sum(rows, 'cost'), meanPeak: Math.round(sum(rows, 'peak') / rows.length), agentCalls: sum(rows, 'agentCalls') };
}

const summaryLine = (name, { cells, pass, cost, meanPeak, agentCalls }) => `${name} pass ${pass}/${cells} cost $${cost.toFixed(2)} mean peak ${meanPeak} agent calls ${agentCalls}`;
const change = (after, before) => (before === 0 ? 'n/a' : `${(((after - before) / before) * 100).toFixed(1)}%`);

const inArm = (rows, arm, task) => rows.filter((row) => row.arm === arm && (task === undefined || row.task === task));

function readoutLines(rows, droppedExo, { exo, before, costLower, peakLower }) {
  const droppedCalls = sum(inArm(droppedExo, 'exo', LEAN_TASK), 'agentCalls');
  const webFailed = rows.filter((row) => row.task === WEB_TASK && !row.pass).length;
  const lines = [
    ...TASKS.filter((task) => inArm(rows, 'exo', task).length > 0).flatMap((task) => ARMS.map((arm) => summaryLine(`${task} ${arm}`, summary(inArm(rows, arm, task))))),
    summaryLine(`arm ${BEFORE}`, before),
    summaryLine('arm exo', exo),
    `delta cost ${change(exo.cost, before.cost)} peak ${change(exo.meanPeak, before.meanPeak)}`,
    `cost lower ${costLower ? 'yes' : 'no'} peak lower ${peakLower ? 'yes' : 'no'} (n=${RUNS} per arm and task: one measure alone is thin)`
  ];
  if (droppedCalls > 0) lines.push(`dropped runs: ${LEAN_TASK} exo agent calls ${droppedCalls}, counted in the check`);
  if (webFailed > 0) lines.push(`web-research failed in ${webFailed} cells: a harness problem, not a verdict`);
  return lines;
}

function readoutProblems(rows, droppedExo, { exo, before, costLower, peakLower }) {
  const leanCalls = sum(inArm([...rows, ...droppedExo], 'exo', LEAN_TASK), 'agentCalls');
  const problems = [];
  if (!costLower && !peakLower) problems.push(`exo is not lower in cost or mean peak than ${BEFORE}`);
  if (exo.pass < before.pass) problems.push(`exo pass ${exo.pass}/${exo.cells} against ${before.pass}/${before.cells} for ${BEFORE}`);
  if (leanCalls > 0) problems.push(`${leanCalls} Agent calls in ${LEAN_TASK} cells of exo`);
  return problems;
}

export function readout(rows, droppedExo = []) {
  const exo = summary(inArm(rows, 'exo'));
  const before = summary(inArm(rows, BEFORE));
  const verdict = { exo, before, costLower: exo.cost < before.cost, peakLower: exo.meanPeak < before.meanPeak };
  return { lines: readoutLines(rows, droppedExo, verdict), problems: readoutProblems(rows, droppedExo, verdict) };
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
  const { rows, dropped, droppedExo } = readCells(flags.check);
  const { lines, problems } = readout(rows, droppedExo);
  console.log([...dropped, ...lines].join('\n'));
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
