#!/usr/bin/env node
// benchmarks/sweep.mjs
// Runs the model and effort sweep. Every cell is its own `claude -p` process
// with the plugin from this clone and the model and effort the cell names,
// started in a fresh repository; it leaves stdout.json, usage.json, diff.patch
// and record.json under benchmarks/runs/<date>-sweep/<cell>/, and the run ends
// by writing benchmarks/results/<date>-sweep.md.
//
//   node benchmarks/sweep.mjs --set all                    prints the calls, starts none
//   node benchmarks/sweep.mjs --set all --confirm          runs every cell
//   node benchmarks/sweep.mjs --set review,plan --confirm --concurrency 1 --out benchmarks/runs/<dir>
//
// Every call is billed, so no cell starts without --confirm. A cell whose
// record.json exists is not run again, so a rerun on the same --out resumes.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { writeCellUsage } from './cell-usage.mjs';
import { claudeArguments, selectCells, sweepCells } from './sweep-cells.mjs';
import { FLOW_TASK_COUNT, prepareBuildRepository, prepareFlowRepository, prepareReviewBranch } from './sweep-fixtures.mjs';
import { countDriftReports, lintPlan, parseReview, resultsMarkdown } from './sweep-score.mjs';
import { ROOT } from './tasks.mjs';

const RUNS = path.join(ROOT, 'benchmarks', 'runs');
const RESULTS = path.join(ROOT, 'benchmarks', 'results');
const SAFE_CHECK_TIMEOUT_MS = 30 * 1000;
const HEARTBEAT_MS = 60 * 1000;

function parseArguments(argv) {
  const options = { sets: null, confirm: false, concurrency: 2, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--set') options.sets = argv[++index].split(',');
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (flag === '--out') options.out = argv[++index];
    else throw new Error(`unknown flag ${flag}`);
  }
  if (options.sets === null) throw new Error('name --set all, or a comma list of review, build, plan, flow');
  return options;
}

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runClaude(cell, workdir, cellDirectory) {
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(cellDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(cellDirectory, 'stderr.log'), 'w');
    const startedAt = Date.now();
    const child = spawn('claude', claudeArguments(cell), {
      cwd: workdir,
      env: { ...process.env, EXO_SAVINGS_DIR: path.join(cellDirectory, 'record') },
      stdio: ['ignore', stdout, stderr]
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, cell.timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      resolve({ exitCode, timedOut, wallMs: Date.now() - startedAt });
    });
  });
}

function readResult(cellDirectory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cellDirectory, 'stdout.json'), 'utf8'));
  } catch {
    return null;
  }
}

function runSafeCheck(taskId, directory) {
  return new Promise((resolve) => {
    const check = path.join(ROOT, 'benchmarks', 'safe', taskId, 'check.mjs');
    const child = spawn(process.execPath, [check, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), SAFE_CHECK_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = output.trim().split('\n').find((row) => row.startsWith('PASS') || row.startsWith('FAIL')) ?? `check exited ${code}`;
      resolve({ pass: code === 0, line });
    });
  });
}

// The report is copied into the cell directory, because the repository is
// removed once the cell is measured.
function readReview(repository, cellDirectory) {
  const file = path.join(repository, '.git', 'branch-review.md');
  if (!fs.existsSync(file)) return { verdict: null, counts: null };
  fs.copyFileSync(file, path.join(cellDirectory, 'branch-review.md'));
  return parseReview(fs.readFileSync(file, 'utf8'));
}

async function measureReview(cell, repository, review) {
  const check = await runSafeCheck(cell.task.id, repository);
  const findings = review.counts === null ? null : review.counts.defect + review.counts.hazard;
  const detail = `verdict ${review.verdict ?? 'none'}, ${findings ?? 'no counted'} defect or hazard findings, check after review: ${check.line}`;
  if (cell.variant === 'seeded') return { defectsFound: check.pass ? 1 : 0, falseAlarms: null, detail };
  return { defectsFound: null, falseAlarms: findings, detail };
}

// Counted over every ref by trailer number, because a wave's commit reaches
// the branch as a cherry-pick with the same message.
function landedTasks(repository) {
  const messages = git(repository, ['log', '--all', '--format=%B']);
  return new Set(messages.match(/^Plan-task: \d+$/gm) ?? []).size;
}

function measureFlow(repository, review, usage) {
  const transcript = usage === null ? '' : fs.readFileSync(usage.transcript, 'utf8');
  const detail = `${landedTasks(repository)}/${FLOW_TASK_COUNT} tasks landed, ${countDriftReports(transcript)} drift reports, review verdict ${review.verdict ?? 'none'}`;
  return { defectsFound: review.counts === null ? null : review.counts.defect, falseAlarms: null, detail };
}

// A plan cell starts without docs/plans/, so the newest file there is its plan.
function newestPlan(repository) {
  const directory = path.join(repository, 'docs', 'plans');
  if (!fs.existsSync(directory)) return null;
  const plans = fs.readdirSync(directory).filter((name) => name.endsWith('.md')).map((name) => path.join(directory, name));
  if (plans.length === 0) return null;
  plans.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return fs.readFileSync(plans[0], 'utf8');
}

async function measureCell(cell, repository, usage, cellDirectory) {
  const review = readReview(repository, cellDirectory);
  if (cell.kind === 'review') return measureReview(cell, repository, review);
  if (cell.kind === 'flow') return measureFlow(repository, review, usage);
  if (cell.kind === 'build') {
    const check = await runSafeCheck(cell.task.id, repository);
    return { defectsFound: check.pass ? 0 : 1, falseAlarms: null, detail: check.line };
  }
  const plan = newestPlan(repository);
  if (plan === null) return { defectsFound: null, falseAlarms: null, detail: 'no plan file' };
  fs.writeFileSync(path.join(cellDirectory, 'plan.md'), plan);
  const defects = lintPlan(plan);
  return { defectsFound: defects.length, falseAlarms: null, detail: defects.join('; ') || 'no rule breach' };
}

function prepareRepository(cell, repository, origin) {
  if (cell.kind === 'review') prepareReviewBranch(repository, cell.task, cell.source);
  else if (cell.kind === 'build') prepareBuildRepository(repository, cell.task);
  // A fixer cell needs a branch carrying a real branch-review.md; the review
  // fixture builds only a branch and a plan, never a report, so nothing here
  // can prepare one without first running a reviewer.
  else if (cell.kind === 'fixer') throw new Error(`fixer cell ${cell.id}: no branch-review.md fixture exists yet; prepareReviewBranch builds a branch and a plan, never a report`);
  else prepareFlowRepository(repository, origin, cell.kind === 'flow');
}

async function runCell(cell, runDirectory) {
  const cellDirectory = path.join(runDirectory, cell.id);
  fs.mkdirSync(cellDirectory, { recursive: true });
  const cellRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `exo-sweep-${cell.id}-`)));
  const repository = path.join(cellRoot, 'repo');
  fs.mkdirSync(repository);
  try {
    prepareRepository(cell, repository, path.join(cellRoot, 'origin.git'));
    const outcome = await runClaude(cell, repository, cellDirectory);
    const result = readResult(cellDirectory);
    const usage = typeof result?.session_id === 'string' ? writeCellUsage(cellDirectory, result.session_id) : null;
    const measured = await measureCell(cell, repository, usage, cellDirectory);
    const record = {
      id: cell.id,
      kind: cell.kind,
      variant: cell.variant,
      model: cell.model,
      effort: cell.effort,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      wallMs: outcome.wallMs,
      costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
      tokens: usage === null ? null : Math.round(usage.counts.weightedInput + usage.counts.output),
      outputTokens: usage === null ? null : usage.counts.output,
      ...measured
    };
    // Staged first, so a file the cell created lands in the patch too.
    git(repository, ['add', '-A']);
    fs.writeFileSync(path.join(cellDirectory, 'diff.patch'), git(repository, ['diff', '--cached', 'HEAD']));
    fs.writeFileSync(path.join(cellDirectory, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } finally {
    fs.rmSync(cellRoot, { recursive: true, force: true });
  }
}

async function runPool(cells, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, cells.length) }, async () => {
    while (next < cells.length) {
      const index = next;
      next += 1;
      await worker(cells[index], index);
    }
  });
  await Promise.all(lanes);
}

// A resumed run keeps the date and versions of its first start, so its
// results file keeps one name.
function readOrWriteMeta(runDirectory, options, cellCount) {
  const file = path.join(runDirectory, 'meta.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    node: process.version,
    sets: options.sets,
    cells: cellCount
  };
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cells = selectCells(sweepCells(), options.sets);
  console.log(`${cells.length} claude -p calls planned, one per cell:`);
  for (const cell of cells) console.log(`  ${cell.id}: --model ${cell.model} --effort ${cell.effort}`);
  if (!options.confirm) {
    console.log('Every call is billed. Re-run with --confirm to start them.');
    process.exitCode = 2;
    return;
  }
  const runDirectory = path.resolve(options.out ?? path.join(RUNS, `${new Date().toISOString().slice(0, 10)}-sweep`));
  fs.mkdirSync(runDirectory, { recursive: true });
  const meta = readOrWriteMeta(runDirectory, options, cells.length);
  const records = [];
  const running = new Set();
  let done = 0;
  const heartbeat = setInterval(() => {
    console.log(`running: ${done}/${cells.length} cells done, in flight: ${[...running].join(', ')}`);
  }, HEARTBEAT_MS);
  try {
    await runPool(cells, options.concurrency, async (cell, index) => {
      const recordFile = path.join(runDirectory, cell.id, 'record.json');
      if (fs.existsSync(recordFile)) {
        records[index] = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
      } else {
        running.add(cell.id);
        records[index] = await runCell(cell, runDirectory);
        running.delete(cell.id);
      }
      done += 1;
      const record = records[index];
      console.log(`[${done}/${cells.length}] ${cell.id} ${Math.round(record.wallMs / 1000)}s defects=${record.defectsFound ?? '-'} falseAlarms=${record.falseAlarms ?? '-'}${record.timedOut ? ' TIMED OUT' : ''}`);
    });
  } finally {
    clearInterval(heartbeat);
  }
  const resultsFile = path.join(RESULTS, `${meta.date}-sweep.md`);
  fs.mkdirSync(RESULTS, { recursive: true });
  fs.writeFileSync(resultsFile, resultsMarkdown(meta, records));
  console.log(`published ${path.relative(ROOT, resultsFile)}`);
}

main().catch((error) => {
  console.error(`sweep: ${error.message}`);
  process.exitCode = 1;
});
