#!/usr/bin/env node
// benchmarks/run.mjs
// Runs benchmark cells headlessly: a fresh checkout of the fixture per cell,
// one `claude -p` call, then the diff, the checks and the raw JSON to disk.
// Nothing is read back into a session; score.mjs prints the table.
//
//   node benchmarks/run.mjs --smoke                       one task per tier, every arm, n=1
//   node benchmarks/run.mjs --full --confirm              every task, every arm, n=4
//   node benchmarks/run.mjs --tasks a,b --arms x,y --runs 2 --model haiku --concurrency 2
//
// A run above smoke size costs money: --full prints the projection from the
// latest smoke run and stops unless --confirm is given.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { measureWorkdir } from './cell-checks.mjs';
import { ARMS, FIXTURE, MODELS, NO_RUN, ROOT, SAFE_TASKS, SMOKE_TASKS, TEMPLATE_TASKS } from './tasks.mjs';

const BENCHMARKS = path.join(ROOT, 'benchmarks');
const FIXTURES = path.join(BENCHMARKS, 'fixtures');
const RUNS = path.join(BENCHMARKS, 'runs');
const CELL_TIMEOUT_MS = 20 * 60 * 1000;
const CELL_BUDGET_USD = '3';
const SAFE_CHECK_TIMEOUT_MS = 30 * 1000;
const FULL_RUNS = 4;
const HEARTBEAT_MS = 60 * 1000;
const GIT_IDENTITY = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com'];

function parseArguments(argv) {
  const options = { mode: 'custom', tasks: null, arms: Object.keys(ARMS), runs: 1, model: 'haiku', concurrency: 2, confirm: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--smoke') options.mode = 'smoke';
    else if (flag === '--full') options.mode = 'full';
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--tasks') options.tasks = value().split(',');
    else if (flag === '--arms') options.arms = value().split(',');
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--model') options.model = value();
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--out') options.out = value();
    else throw new Error(`unknown flag ${flag}`);
  }
  if (options.mode === 'smoke') options.tasks = options.tasks ?? SMOKE_TASKS;
  if (options.mode === 'full') {
    options.tasks = options.tasks ?? [...TEMPLATE_TASKS, ...SAFE_TASKS].map((task) => task.id);
    options.runs = FULL_RUNS;
  }
  if (options.tasks === null) throw new Error('name --tasks, or pick --smoke or --full');
  if (!(options.model in MODELS)) throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}`);
  for (const arm of options.arms) if (!(arm in ARMS)) throw new Error(`unknown arm ${arm}`);
  return options;
}

function findTask(taskId) {
  const template = TEMPLATE_TASKS.find((task) => task.id === taskId);
  if (template) return { ...template, tier: 'template' };
  const safe = SAFE_TASKS.find((task) => task.id === taskId);
  if (safe) return { ...safe, tier: 'safe' };
  throw new Error(`unknown task ${taskId}`);
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...GIT_IDENTITY, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function ensureTemplateFixture() {
  const directory = path.join(FIXTURES, FIXTURE.name);
  if (!fs.existsSync(path.join(directory, '.git'))) {
    fs.mkdirSync(FIXTURES, { recursive: true });
    console.log(`cloning ${FIXTURE.repo} into ${directory}`);
    execFileSync('git', ['clone', '-q', FIXTURE.repo, directory], { stdio: 'inherit' });
  }
  git(directory, ['checkout', '-q', FIXTURE.commit]);
  return directory;
}

function workdirFor(task, fixtureDirectory) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `exo-bench-${task.id}-`));
  if (task.tier === 'template') {
    execFileSync('git', ['clone', '-q', fixtureDirectory, workdir], { stdio: 'ignore' });
    git(workdir, ['checkout', '-q', FIXTURE.commit]);
    return workdir;
  }
  fs.cpSync(path.join(BENCHMARKS, 'safe', task.id, 'seed'), workdir, { recursive: true });
  git(workdir, ['init', '-q']);
  git(workdir, ['add', '-A']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  return workdir;
}

function claudeArguments(armName, task, model) {
  const arm = ARMS[armName];
  const systemPrompt = arm.prompt === null ? NO_RUN : `${NO_RUN}\n\n${arm.prompt}`;
  const args = [
    '-p', task.prompt,
    '--model', MODELS[model],
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--disallowedTools', 'Bash',
    '--max-budget-usd', CELL_BUDGET_USD,
    '--append-system-prompt', systemPrompt
  ];
  if (arm.pluginDir !== null) args.push('--plugin-dir', arm.pluginDir);
  return args;
}

function runClaude(args, workdir, cellDirectory) {
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(cellDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(cellDirectory, 'stderr.log'), 'w');
    const startedAt = Date.now();
    const child = spawn('claude', args, {
      cwd: workdir,
      env: { ...process.env, EXO_SAVINGS_DIR: path.join(cellDirectory, 'ledger') },
      stdio: ['ignore', stdout, stderr]
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CELL_TIMEOUT_MS);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      resolve({ exitCode, timedOut, wallMs: Date.now() - startedAt });
    });
  });
}

function parseResult(cellDirectory) {
  const raw = fs.readFileSync(path.join(cellDirectory, 'stdout.json'), 'utf8');
  try {
    const result = JSON.parse(raw);
    fs.writeFileSync(path.join(cellDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch {
    return null;
  }
}

function runSafeCheck(task, workdir) {
  return new Promise((resolve) => {
    const check = path.join(BENCHMARKS, 'safe', task.id, 'check.mjs');
    const child = spawn(process.execPath, [check, workdir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), SAFE_CHECK_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = output.trim().split('\n').find((row) => row.startsWith('PASS') || row.startsWith('FAIL')) ?? `check exited ${code}: ${output.trim().slice(0, 200)}`;
      resolve({ safe: code === 0, safeReason: line });
    });
  });
}

// The user's own ledger must stay untouched: a session id that lands there
// means the installed plugin ran instead of, or beside, the arm's plugin.
function userLedgerHolds(sessionId) {
  const configDirectory = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const file = path.join(configDirectory, 'exo', 'savings', 'sessions.json');
  try {
    return sessionId in JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

function cellLedgerSessions(cellDirectory) {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(cellDirectory, 'ledger', 'sessions.json'), 'utf8'))).length;
  } catch {
    return 0;
  }
}

async function runCell(cell, fixtureDirectory) {
  const { task, arm, run, model, cellDirectory } = cell;
  fs.mkdirSync(cellDirectory, { recursive: true });
  const workdir = workdirFor(task, fixtureDirectory);
  try {
    const outcome = await runClaude(claudeArguments(arm, task, model), workdir, cellDirectory);
    const result = parseResult(cellDirectory);
    const checks = {
      task: task.id, tier: task.tier, arm, run, model: MODELS[model],
      exitCode: outcome.exitCode, timedOut: outcome.timedOut, wallMs: outcome.wallMs,
      resultParsed: result !== null,
      ledgerSessions: cellLedgerSessions(cellDirectory),
      userLedgerTouched: result !== null && typeof result.session_id === 'string' ? userLedgerHolds(result.session_id) : null
    };
    if (task.tier === 'template') {
      Object.assign(checks, measureWorkdir(workdir, task));
    } else {
      Object.assign(checks, { loc: measureWorkdir(workdir, { kind: 'safe' }).loc }, await runSafeCheck(task, workdir));
    }
    fs.writeFileSync(path.join(cellDirectory, 'diff.patch'), git(workdir, ['diff', '--cached', 'HEAD']));
    fs.writeFileSync(path.join(cellDirectory, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
    return checks;
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
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

function latestSmokeCost() {
  if (!fs.existsSync(RUNS)) return null;
  const smokes = fs.readdirSync(RUNS).filter((name) => name.endsWith('-smoke')).sort();
  if (smokes.length === 0) return null;
  const costs = [];
  const directory = path.join(RUNS, smokes[smokes.length - 1]);
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (path.basename(file) !== 'result.json') continue;
    const result = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    if (typeof result.total_cost_usd === 'number') costs.push(result.total_cost_usd);
  }
  if (costs.length === 0) return null;
  return { directory, cells: costs.length, mean: costs.reduce((sum, cost) => sum + cost, 0) / costs.length };
}

function costGate(options, cellCount) {
  if (options.mode !== 'full' || options.confirm) return;
  const smoke = latestSmokeCost();
  if (smoke === null) {
    console.log(`${cellCount} cells planned; no smoke run under ${RUNS} to project the cost from. Run --smoke first.`);
    process.exit(2);
  }
  console.log(`${cellCount} cells planned at a smoke mean of $${smoke.mean.toFixed(3)} per cell (${smoke.cells} cells in ${smoke.directory}): about $${(smoke.mean * cellCount).toFixed(2)}.`);
  console.log('Re-run with --confirm after the user approves this projection.');
  process.exit(2);
}

function claudeVersion() {
  return execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const date = new Date().toISOString().slice(0, 10);
  const runDirectory = options.out ?? path.join(RUNS, `${date}-${options.mode}`);
  const tasks = options.tasks.map(findTask);
  const cells = [];
  for (const task of tasks) {
    for (let run = 1; run <= options.runs; run += 1) {
      for (const arm of options.arms) {
        cells.push({ task, arm, run, model: options.model, cellDirectory: path.join(runDirectory, task.id, arm, String(run)) });
      }
    }
  }
  costGate(options, cells.length);
  const fixtureDirectory = tasks.some((task) => task.tier === 'template') ? ensureTemplateFixture() : null;
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.writeFileSync(path.join(runDirectory, 'meta.json'), `${JSON.stringify({
    date, mode: options.mode, model: MODELS[options.model], claudeVersion: claudeVersion(), node: process.version,
    fixture: FIXTURE, arms: options.arms, tasks: options.tasks, runs: options.runs, cells: cells.length
  }, null, 2)}\n`);
  console.log(`${cells.length} cells into ${runDirectory}`);
  let done = 0;
  const heartbeat = setInterval(() => console.log(`running: ${done}/${cells.length} cells done`), HEARTBEAT_MS);
  await runPool(cells, options.concurrency, async (cell) => {
    if (fs.existsSync(path.join(cell.cellDirectory, 'checks.json'))) {
      done += 1;
      console.log(`[${done}/${cells.length}] ${cell.task.id} ${cell.arm} #${cell.run} already done`);
      return;
    }
    const checks = await runCell(cell, fixtureDirectory);
    done += 1;
    const result = checks.resultParsed ? JSON.parse(fs.readFileSync(path.join(cell.cellDirectory, 'result.json'), 'utf8')) : {};
    const cost = typeof result.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(3)}` : 'no result';
    const verdict = checks.tier === 'template' ? `correct=${checks.correct}` : `safe=${checks.safe}`;
    console.log(`[${done}/${cells.length}] ${cell.task.id} ${cell.arm} #${cell.run} ${cost} ${Math.round(checks.wallMs / 1000)}s loc=${checks.loc.added} ${verdict}${checks.timedOut ? ' TIMED OUT' : ''}`);
  });
  clearInterval(heartbeat);
  console.log(`done: node benchmarks/score.mjs ${path.relative(process.cwd(), runDirectory)}`);
}

main().catch((error) => {
  console.error(`run: ${error.message}`);
  process.exit(1);
});
