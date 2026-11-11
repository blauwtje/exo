#!/usr/bin/env node
// benchmarks/sweep.mjs
// Runs the model and effort sweep. Every cell is its own `claude -p` process
// with the plugin from this clone and the model and effort the cell names,
// started in a fresh repository; it leaves stdout.json, usage.json, diff.patch
// and record.json under benchmarks/runs/<date>-sweep/<cell>/, and the run ends
// by writing <date>-sweep.md under --results, benchmarks/results/ by default.
//
//   node benchmarks/sweep.mjs                              quick tier: prints the 4 review cells, starts none
//   node benchmarks/sweep.mjs --confirm                    runs the quick tier, about $0.65
//   node benchmarks/sweep.mjs --dry-run                    prints the calls and the projected cost, starts none, exit 0
//   node benchmarks/sweep.mjs --full                       the full tier, every set: prints the calls, starts none
//   node benchmarks/sweep.mjs --full --confirm             runs every cell
//   node benchmarks/sweep.mjs --set all                    names the sets itself and leaves the quick tier: prints the calls, starts none
//   node benchmarks/sweep.mjs --set review,plan --confirm --concurrency 1 --out benchmarks/runs/<dir>
//   node benchmarks/sweep.mjs --set fixer --confirm --results <dir>   writes the results file outside the tree
//   node benchmarks/sweep.mjs --set flow --cells flow-c7,flow-base   keeps only the named cells of the sets
//   node benchmarks/sweep.mjs --set flow --cells flow-unit --confirm --keep-repo <dir>   keeps each cell repository as a checkpoint
//
// Every call is billed, so no cell starts without --confirm, and --dry-run never starts one. A cell whose
// record.json exists is not run again, so a rerun on the same --out resumes.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createWorktree } from '#checkout';
import { confinedClaude } from '#confine-claude';
import { killTree } from '#process-tree';
import { writeCellUsage, writeRunUsage } from './cell-usage.mjs';
import { JUDGE_NAMES, judgeBodies, parseReviewerBodies } from '../lib/review-judges.mjs';
import { reviewPrompt } from '../skills/build/scripts/run-tail.mjs';
import { cellEnvironment, claudeArguments, judgeCells, pluginVariants, providerCells, replayCells, runArguments, selectCells, sweepCells } from './sweep-cells.mjs';
import { configDir, loadRunConfig, readKeys, resolveProvider } from '../skills/build/scripts/run-config.mjs';
import { flowWebCells, defectRange } from './sweep-fixtures.mjs';
import { prepareRepository } from './sweep-prepare.mjs';
import { lintPlan, overlaps, parseReview, resultsMarkdown } from './sweep-score.mjs';
import { landedTasks } from './sweep-baseline.mjs';
import { plannedPowerLine } from './power-plan.mjs';
import { projectSweep, sweepProjectionLine } from './sweep-projection.mjs';
import { ROOT } from './tasks.mjs';
import { copyPluginWithoutTasks, newestRunLedger } from './value.mjs';
import { applyVariant } from './variants.mjs';
import { readOrWriteMeta } from './sweep-meta.mjs';
import { measureFlow } from './sweep-flow-measure.mjs';
import { existingBase, pairCells, rejectBaseVariants, runPairs } from './sweep-paired.mjs';
import { pairedSection } from './sweep-paired-report.mjs';
import { readJson, readJsonOrNull } from './basics.mjs';
import { recordCostFields } from './pricing.mjs';

const RUNS = path.join(ROOT, 'benchmarks', 'runs');
const RESULTS = path.join(ROOT, 'benchmarks', 'results');
const SAFE_CHECK_TIMEOUT_MS = 30 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const KILL_GRACE_MS = 10 * 1000;
// EXO_SWEEP_CELL_TIMEOUT_MS shortens every cell's time-out, for the tests.
const CELL_TIMEOUT_MS = Number(process.env.EXO_SWEEP_CELL_TIMEOUT_MS) || null;
// Cells running now, each with the scratch folder that goes once it has closed.
const live = new Map();
// Set by the sweep's own SIGINT or SIGTERM: no further cell starts, and a cell
// it ended records nothing, so a rerun on the same --out runs that cell again.
let stopping = false;

// SIGTERM to the cell's process group, SIGKILL to it once the grace has passed or
// the leader has closed, so no grandchild outlives the cell or its folder.
function endGroup(child) {
  if (process.platform === 'win32') killTree(child.pid);
  else try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  const grace = setTimeout(() => killTree(child.pid), KILL_GRACE_MS);
  child.once('close', () => clearTimeout(grace));
}

// Once the leader has closed its pid may be reused, so only its group is
// signalled: a group id stays taken while any member runs. Windows has no
// groups, and the bare pid is no longer the cell's, so nothing is sent there.
function killLeftovers(child) {
  if (process.platform === 'win32') return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const roots = [...live.values()];
    const leave = () => {
      for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
      process.exit(130);
    };
    if (live.size === 0) leave();
    for (const child of live.keys()) {
      endGroup(child);
      child.once('close', () => {
        live.delete(child);
        if (live.size === 0) leave();
      });
    }
  });
}

export const QUICK_CELLS = [
  'review-safe-path-seeded-high',
  'review-safe-path-control-high',
  'review-sql-user-seeded-high',
  'review-sql-user-control-high'
];

export { JUDGE_NAMES, prepareRepository, landedTasks };

function withTier(options) {
  if (options.sets !== null) return { ...options, tier: 'custom' };
  if (options.cells !== null) throw new Error('name --set all, or a comma list of review, build, plan, flow, replay');
  if (options.full) return { ...options, sets: ['all'], tier: 'full' };
  return { ...options, sets: ['review'], cells: QUICK_CELLS, tier: 'quick' };
}

export function parseArguments(argv) {
  const options = { sets: null, cells: null, confirm: false, dryRun: false, full: false, concurrency: 2, out: null, results: RESULTS, cases: null, models: ['opus'], repeat: 1, keepRepo: null, reviewerBodies: null, provider: 'claude', efforts: null, baseline: null, base: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--set') options.sets = argv[++index].split(',');
    else if (flag === '--cells') options.cells = argv[++index].split(',');
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--full') options.full = true;
    else if (flag === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (flag === '--out') options.out = argv[++index];
    else if (flag === '--results') options.results = argv[++index];
    else if (flag === '--cases') options.cases = argv[++index];
    else if (flag === '--models') options.models = argv[++index].split(',');
    else if (flag === '--repeat') options.repeat = Number(argv[++index]);
    else if (flag === '--keep-repo') options.keepRepo = argv[++index];
    else if (flag === '--baseline') options.baseline = argv[++index];
    else if (flag === '--base') options.base = existingBase(argv[++index]);
    else if (flag === '--provider') options.provider = argv[++index];
    else if (flag === '--effort') options.efforts = argv[++index].split(',');
    else if (flag === '--reviewer-bodies') options.reviewerBodies = parseReviewerBodies(argv[++index]);
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) throw new Error('--repeat must be a positive integer');
  if (options.results.endsWith('.md')) throw new Error(`--results names a folder, not a file: the sweep publishes <date>-sweep.md into it, so pass the folder of ${options.results}`);
  const tiered = withTier(options);
  if (tiered.keepRepo === undefined) throw new Error('--keep-repo needs a folder');
  if (tiered.keepRepo !== null && tiered.sets.includes('replay')) throw new Error('--keep-repo does not apply to the replay set: a replay cell is a worktree of this clone');
  if (tiered.sets.includes('replay') && tiered.cases === null) throw new Error('--set replay needs --cases <path>');
  return tiered;
}

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A cell with a plugin variant loads that variant's copy from `copies`; every
// other cell loads this clone, as before. The run is confined to its cell root,
// which holds the repository, its origin and its temporary directory.
export function runClaude(cell, workdir, cellRoot, cellDirectory, copies, providerEnv = null) {
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(cellDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(cellDirectory, 'stderr.log'), 'w');
    const startedAt = Date.now();
    const pluginDir = cell.pluginDir ?? (cell.pluginVariant ? copies[cell.pluginVariant] : ROOT);
    const tmp = path.join(cellRoot, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });
    // A run arm starts exo run unconfined, as a user would; its sessions confine
    // themselves through the wrapper, given the cell root here.
    const run = cell.runSession
      ? { command: process.execPath, args: runArguments(cell, pluginDir), env: { EXO_SWEEP_CELL_ROOT: cellRoot }, cwd: workdir }
      : confinedClaude({ args: claudeArguments(cell, pluginDir), roots: [cellRoot], cwd: workdir, tmp });
    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: cellEnvironment(cell, process.env, run.env, providerEnv),
      stdio: ['ignore', stdout, stderr],
      detached: process.platform !== 'win32'
    });
    live.set(child, cellRoot);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      endGroup(child);
    }, CELL_TIMEOUT_MS ?? cell.timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      live.delete(child);
      // The leader may have left a descendant behind, so the group goes whatever ended it.
      killLeftovers(child);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      resolve({ exitCode, timedOut, wallMs: Date.now() - startedAt });
    });
  });
}

function readResult(cellDirectory) {
  return readJsonOrNull(path.join(cellDirectory, 'stdout.json'));
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
function readReview(repository, cellDirectory, file = path.join(repository, '.git', 'branch-review.md')) {
  if (!fs.existsSync(file)) return { verdict: null, counts: null, findings: null };
  fs.copyFileSync(file, path.join(cellDirectory, 'branch-review.md'));
  return parseReview(fs.readFileSync(file, 'utf8'));
}

// The green-first branch carries one defect: a test-first fix whose report
// quotes no failing run, so a cell finds it when its report counts a defect.
function measureGreenFirst(review) {
  const defects = review.counts === null ? null : review.counts.defect;
  const detail = `verdict ${review.verdict ?? 'none'}, ${defects ?? 'no counted'} defect findings`;
  return { defectsFound: defects !== null && defects > 0 ? 1 : 0, falseAlarms: null, detail };
}

export async function measureReview(cell, repository, review) {
  if (cell.variant === 'green-first') return measureGreenFirst(review);
  const fixes = review.findings === null ? null : review.findings.filter((finding) => finding.action === 'fix');
  const detail = `verdict ${review.verdict ?? 'none'}, ${fixes?.length ?? 'no'} fix findings`;
  if (cell.variant === 'seeded') {
    const range = defectRange(cell.task);
    const hits = fixes === null ? null : Number(fixes.some((finding) => overlaps(finding, range)));
    const reportHits = review.findings === null ? null : Number(review.findings.some((finding) => overlaps(finding, range)));
    return { defectsFound: hits, falseAlarms: null, detail, hits, reportHits };
  }
  return { defectsFound: null, falseAlarms: fixes === null ? null : fixes.length, detail };
}

function measureReplay(cell, review) {
  const fixes = review.findings === null ? null : review.findings.filter((finding) => finding.action === 'fix');
  const truth = cell.replay.findings;
  if (fixes === null) return { defectsFound: null, falseAlarms: null, detail: 'no report', hits: null, truth: truth.length, extra: null };
  const hits = truth.filter((range) => fixes.some((finding) => overlaps(finding, range))).length;
  const extra = fixes.filter((finding) => !truth.some((range) => overlaps(finding, range))).length;
  const detail = `verdict ${review.verdict ?? 'none'}, ${hits}/${truth.length} known defects hit, ${extra} other fix findings`;
  return { defectsFound: hits, falseAlarms: extra, detail, hits, truth: truth.length, extra };
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
  if (cell.kind === 'replay') return measureReplay(cell, readReview(repository, cellDirectory, replayFindings(repository)));
  const review = readReview(repository, cellDirectory);
  if (cell.kind === 'review') return measureReview(cell, repository, review);
  if (cell.kind.startsWith('flow')) return measureFlow({ cell, repository, review, usage });
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

const replayFindings = (repository) => path.join(path.dirname(repository), 'branch-review.md');

function addReplayWorktree(cell, repository) {
  const added = createWorktree(ROOT, repository, ['--detach', repository, cell.replay.head], { env: false });
  if (!added.ok) throw new Error(`git worktree add --detach ${repository} ${cell.replay.head} failed: ${added.error}`);
  const { base, scope } = cell.replay;
  const source = path.resolve(ROOT, cell.replay.plan);
  if (!fs.existsSync(source)) throw new Error(`replay case ${cell.replay.id}: plan ${source} does not exist`);
  // The past head has no plan file, so the reviewer reads a copy under the checkout's excluded .exo/.
  const plan = path.join(repository, '.exo', path.basename(source));
  fs.mkdirSync(path.dirname(plan), { recursive: true });
  fs.copyFileSync(source, plan);
  // A `fix diff` review reads the uncommitted tree, so leave base..head uncommitted.
  if (scope === 'fix diff') git(repository, ['reset', '--quiet', base]);
  return { ...cell, prompt: reviewPrompt({ planPath: plan, root: repository, base, branch: cell.replay.head, scope, findings: replayFindings(repository) }) };
}

export function allCells() {
  const cells = sweepCells();
  const shared = cells.find((cell) => cell.id === 'flow-unit');
  return [...cells, ...flowWebCells(shared, process.env.EXO_FLOW_WEB_PROFILE ?? 'full')];
}


// Copies a measured cell's repository, with its excluded .exo/ and its origin,
// to <keep>/<name>/ before the cell root goes, so a later run can start from
// that state; the cell's tmp folder is not kept.
export function keepRepository(cellRoot, keep, name) {
  const destination = path.join(path.resolve(keep), name);
  fs.rmSync(destination, { recursive: true, force: true });
  for (const entry of ['repo', 'origin.git']) {
    const source = path.join(cellRoot, entry);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, entry), { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  }
  return destination;
}

async function runCell(cell, runDirectory, copies, keep = null, providerEnv = null) {
  const cellDirectory = path.join(runDirectory, cell.directory ?? cell.id);
  fs.mkdirSync(cellDirectory, { recursive: true });
  const cellRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `exo-sweep-${cell.id}-`)));
  const repository = path.join(cellRoot, 'repo');
  if (cell.kind !== 'replay') fs.mkdirSync(repository);
  try {
    const started = cell.kind === 'replay' ? addReplayWorktree(cell, repository) : cell;
    if (cell.kind !== 'replay') prepareRepository(cell, repository, path.join(cellRoot, 'origin.git'));
    const outcome = await runClaude(started, repository, cellRoot, cellDirectory, copies, providerEnv);
    if (stopping) return null;
    const result = readResult(cellDirectory);
    const usage = cell.runSession
      ? writeRunUsage(cellDirectory, newestRunLedger(repository))
      : typeof result?.session_id === 'string' ? writeCellUsage(cellDirectory, result.session_id) : null;
    // Read before cellRoot goes; a build session without a hook means the cell measured no exo.
    if (usage?.missingHooks > 0) throw new Error(`${cell.id}: exo hooks did not run`);
    const measured = await measureCell(cell, repository, usage, cellDirectory);
    const record = {
      id: cell.id,
      ...(cell.arm === undefined ? {} : { arm: cell.arm }),
      ...(cell.repeat === undefined ? {} : { repeat: cell.repeat }),
      kind: cell.kind,
      variant: cell.variant,
      model: cell.model,
      effort: cell.effort,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      wallMs: outcome.wallMs,
      ...recordCostFields(cell, result, usage, outcome.wallMs),
      tokens: usage?.counts == null ? null : Math.round(usage.counts.weightedInput + usage.counts.output),
      outputTokens: usage?.counts == null ? null : usage.counts.output,
      ...measured
    };
    // Staged first, so a file the cell created lands in the patch too.
    git(repository, ['add', '-A']);
    fs.writeFileSync(path.join(cellDirectory, 'diff.patch'), git(repository, ['diff', '--cached', 'HEAD']));
    fs.writeFileSync(path.join(cellDirectory, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    if (keep !== null) keepRepository(cellRoot, keep, cell.directory ?? cell.id);
    return record;
  } finally {
    if (cell.kind === 'replay') git(ROOT, ['worktree', 'remove', '--force', repository]);
    fs.rmSync(cellRoot, { recursive: true, force: true });
  }
}

async function runPool(cells, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, cells.length) }, async () => {
    while (!stopping && next < cells.length) {
      const index = next;
      next += 1;
      await worker(cells[index], index);
    }
  });
  await Promise.all(lanes);
}

// A cell id outside the chosen sets is refused, so a typo never runs fewer
// cells than asked without a word.
function keepNamedCells(cells, ids) {
  if (ids === null) return cells;
  const known = cells.map((cell) => cell.id);
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length > 0) throw new Error(`unknown cell ${unknown.join(', ')} in the chosen sets; one of ${known.join(', ')}`);
  return cells.filter((cell) => ids.includes(cell.id));
}

// Replay cells already expand by repeat in replayCells; every other cell gets
// `repeat` copies that keep the base id, so the copies stay one arm, and differ
// in `directory` (`<id>-<k>`) and `repeat`, so each writes its own result dir.
export function repeatCells(cells, repeat) {
  if (repeat === 1) return cells;
  return cells.flatMap((cell) => cell.kind === 'replay' ? [cell] : Array.from({ length: repeat }, (_, index) => ({ ...cell, directory: `${cell.id}-${index + 1}`, repeat: index + 1 })));
}

function sweepProvider(options) {
  if (options.provider === 'claude' && options.efforts === null) return null;
  const home = os.homedir();
  const config = loadRunConfig({ home });
  const entry = config.providers[options.provider];
  if (entry === undefined) throw new Error(`unknown provider ${options.provider}; one of ${Object.keys(config.providers).join(', ')}`);
  const efforts = options.efforts ?? [config.defaults.effort];
  const refused = efforts.filter((effort) => !entry.efforts.includes(effort));
  if (refused.length > 0) throw new Error(`${options.provider} takes no effort ${refused.join(', ')}; one of ${entry.efforts.join(', ')}`);
  const provider = { name: options.provider, model: entry.model, efforts };
  if (!options.confirm || options.dryRun) return provider;
  const resolved = resolveProvider(config, options.provider, readKeys(path.join(configDir(home), 'keys.env')), efforts[0], home);
  if (resolved.refused !== undefined) throw new Error(resolved.refused);
  return { ...provider, env: options.provider === 'claude' ? null : resolved.env };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const provider = sweepProvider(options);
  const replay = options.cases === null ? [] : replayCells(readJson(options.cases), options);
  const judged = options.reviewerBodies === null ? allCells() : judgeCells(allCells(), judgeBodies(options.reviewerBodies));
  const chosen = keepNamedCells(selectCells([...judged, ...replay], options.sets), options.cells);
  const repeated = repeatCells(provider === null ? chosen : providerCells(chosen, provider, provider.efforts), options.repeat);
  rejectBaseVariants(options.base, pluginVariants(repeated));
  const pairs = options.base === null ? null : pairCells(repeated, { base: options.base, candidate: ROOT });
  const cells = pairs === null ? repeated : pairs.flat();
  console.log(`${options.tier} tier, ${cells.length} claude -p calls planned, one per cell and repeat:`);
  for (const cell of cells) console.log(`  ${cell.directory ?? cell.id}: --model ${cell.model} --effort ${cell.effort}`);
  if (options.keepRepo !== null) console.log(`keeps each cell repository under ${options.keepRepo}`);
  if (options.dryRun || !options.confirm) {
    const projection = projectSweep(cells.map((cell) => cell.id), RUNS);
    console.log(sweepProjectionLine(projection, cells.length));
    if (options.dryRun) {
      const arms = pairs === null ? 1 : 2;
      const tasks = new Set(repeated.map((cell) => cell.id)).size;
      console.log(plannedPowerLine({ tasks, samples: Math.round(repeated.length / Math.max(1, tasks)), arms }));
      return;
    }
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
  // One copy per sweep and plugin variant, as run.mjs makes for its cut arms.
  const copies = {};
  const heartbeat = setInterval(() => {
    console.log(`running: ${done}/${cells.length} cells done, in flight: ${[...running].join(', ')}`);
  }, HEARTBEAT_MS);
  try {
    for (const name of pluginVariants(cells)) {
      copies[name] = copyPluginWithoutTasks(ROOT, fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sweep-plugin-')));
      applyVariant(name, copies[name]);
    }
    const runOne = async (cell, index) => {
      const recordFile = path.join(runDirectory, cell.directory ?? cell.id, 'record.json');
      if (fs.existsSync(recordFile)) {
        records[index] = readJson(recordFile);
      } else {
        running.add(cell.directory ?? cell.id);
        records[index] = await runCell(cell, runDirectory, copies, options.keepRepo, provider?.env ?? null);
        running.delete(cell.directory ?? cell.id);
        // Null once the sweep's own signal ended the cell; the sweep exits when its last cell closes.
        if (records[index] === null) return;
      }
      done += 1;
      const record = records[index];
      console.log(`[${done}/${cells.length}] ${cell.directory ?? cell.id} ${Math.round(record.wallMs / 1000)}s defects=${record.defectsFound ?? '-'} falseAlarms=${record.falseAlarms ?? '-'}${record.timedOut ? ' TIMED OUT' : ''}`);
    };
    if (pairs === null) await runPool(cells, options.concurrency, runOne);
    else await runPairs(pairs, options.concurrency, (cell) => (stopping ? null : runOne(cell, cells.indexOf(cell))));
  } finally {
    clearInterval(heartbeat);
    for (const copy of Object.values(copies)) fs.rmSync(copy, { recursive: true, force: true });
  }
  const resultsDirectory = path.resolve(options.results);
  const resultsFile = path.join(resultsDirectory, `${meta.date}-sweep.md`);
  fs.mkdirSync(resultsDirectory, { recursive: true });
  const paired = options.base === null ? '' : pairedSection(records.filter(Boolean));
  fs.writeFileSync(resultsFile, resultsMarkdown(meta, records) + (paired === '' ? '' : `\n${paired}`));
  console.log(`published ${path.relative(ROOT, resultsFile)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`sweep: ${error.message}`);
    process.exitCode = 1;
  });
}
