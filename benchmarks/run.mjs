#!/usr/bin/env node
// benchmarks/run.mjs
// Runs benchmark cells headlessly: a fresh checkout of the fixture per cell,
// one `claude -p` call, then the diff, the checks and the raw JSON to disk.
// Nothing is read back into a session; score.mjs prints the table.
//
//   node benchmarks/run.mjs --smoke                       one task per tier, every arm, n=1
//   node benchmarks/run.mjs --full --confirm              every task, every arm, n=4
//   node benchmarks/run.mjs --tasks a,b --arms x,y --runs 2 --model haiku --concurrency 2
//   node benchmarks/run.mjs --tasks calib-reply --arms baseline,exo --runs 6 --concurrency 1
//                                                         cells of the calibration tier
//   node benchmarks/run.mjs --tasks git-force-push --arms exo,baseline,skills-rival,cc-safety-net,prose-rules --model sonnet --effort high --dry-run
//                                                         the git tier; --dry-run prints each cell's argv and spends nothing
//                                                         (rival plugins first: node benchmarks/rivals.mjs, after
//                                                         benchmarks/fixtures/rivals.local.json names the local-only ones)
//
// A run above smoke size costs money: --full prints the projection from the
// latest smoke run and stops unless --confirm is given.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { countLines, measureWorkdir } from './cell-checks.mjs';
import { exoLoaded, writeCellUsage } from './cell-usage.mjs';
import { ARMS, CALIBRATION_TASKS, DEFAULT_ARMS, FIXTURE, GIT_TASKS, MODELS, NO_RUN, ROOT, SAFE_TASKS, SMOKE_TASKS, TEMPLATE_TASKS } from './tasks.mjs';

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
  const options = { mode: 'custom', tasks: null, arms: DEFAULT_ARMS, runs: 1, model: 'haiku', concurrency: 2, confirm: false, out: null, effort: null, dryRun: false };
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
    else if (flag === '--effort') options.effort = value();
    else if (flag === '--dry-run') options.dryRun = true;
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
  const gitTask = GIT_TASKS.find((task) => task.id === taskId);
  if (gitTask) return { ...gitTask, tier: 'git' };
  const calibration = CALIBRATION_TASKS.find((task) => task.id === taskId);
  if (calibration) return { ...calibration, tier: 'calibration' };
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

// A calibration cell writes nothing, so its workdir is an empty repository
// with one commit for the diff to compare against.
function workdirFor(task, fixtureDirectory) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `exo-bench-${task.id}-`));
  if (task.tier === 'git') return workdir;
  if (task.tier === 'template') {
    execFileSync('git', ['clone', '-q', fixtureDirectory, workdir], { stdio: 'ignore' });
    git(workdir, ['checkout', '-q', FIXTURE.commit]);
    return workdir;
  }
  if (task.tier === 'calibration') {
    git(workdir, ['init', '-q']);
    git(workdir, ['commit', '-q', '--allow-empty', '-m', 'seed']);
    return workdir;
  }
  fs.cpSync(path.join(BENCHMARKS, 'safe', task.id, 'seed'), workdir, { recursive: true });
  git(workdir, ['init', '-q']);
  git(workdir, ['add', '-A']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  return workdir;
}

// The git tier lets the model run Bash, which is where its hazard lives, so it
// gets neither the Bash ban nor NO_RUN.
function claudeArguments(armName, task, model, effort) {
  const arm = ARMS[armName];
  const git = task.tier === 'git';
  const systemPrompt = git ? arm.prompt : arm.prompt === null ? NO_RUN : `${NO_RUN}\n\n${arm.prompt}`;
  const prompt = arm.promptSuffix === null ? task.prompt : `${task.prompt} ${arm.promptSuffix}`;
  const args = [
    '-p', prompt,
    '--model', MODELS[model],
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config'
  ];
  if (!git) args.push('--disallowedTools', 'Bash');
  args.push('--max-budget-usd', CELL_BUDGET_USD);
  if (systemPrompt !== null) args.push('--append-system-prompt', systemPrompt);
  if (effort !== null) args.push('--effort', effort);
  for (const pluginDirectory of arm.pluginDirs) args.push('--plugin-dir', pluginDirectory);
  return args;
}

// Git-tier cells drop the user's CLAUDE.md files and auto memory, which carry a
// push rule of their own and would load into every arm; other tiers keep the
// environment their past results were measured in.
function gitIsolation(task) {
  return task.tier === 'git' ? { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } : {};
}

function runClaude(args, workdir, cellDirectory, extraEnvironment) {
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(cellDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(cellDirectory, 'stderr.log'), 'w');
    const startedAt = Date.now();
    const child = spawn('claude', args, {
      cwd: workdir,
      env: { ...process.env, ...extraEnvironment, EXO_SESSIONS_DIR: path.join(cellDirectory, 'sessions') },
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

// Deny messages a hook or the permission layer left in the result, for reading
// only: the score comes from the git state alone.
function denyMessages(result) {
  if (result === null) return [];
  const denials = Array.isArray(result.permission_denials) ? result.permission_denials.map((denial) => JSON.stringify(denial)) : [];
  const lines = typeof result.result === 'string' ? result.result.split('\n').filter((line) => /blocked|denied|\bdeny\b/i.test(line)) : [];
  return [...denials, ...lines];
}

async function runCell(cell, fixtureDirectory, effort) {
  const { task, arm, run, model, cellDirectory } = cell;
  fs.mkdirSync(cellDirectory, { recursive: true });
  let workdir = workdirFor(task, fixtureDirectory);
  const cellRoot = workdir;
  if (task.tier === 'git') {
    const { setupCell } = await import(`./git/${task.dir}/setup.mjs`);
    setupCell(cellRoot);
    workdir = path.join(cellRoot, 'repo');
  }
  try {
    const outcome = await runClaude(claudeArguments(arm, task, model, effort), workdir, cellDirectory, gitIsolation(task));
    const result = parseResult(cellDirectory);
    if (result !== null && typeof result.session_id === 'string') writeCellUsage(cellDirectory, result.session_id);
    const checks = {
      task: task.id, tier: task.tier, arm, run, model: MODELS[model],
      exitCode: outcome.exitCode, timedOut: outcome.timedOut, wallMs: outcome.wallMs,
      resultParsed: result !== null,
      exoLoaded: result !== null && typeof result.session_id === 'string' ? exoLoaded(result.session_id) : null
    };
    if (task.tier === 'template') {
      Object.assign(checks, measureWorkdir(workdir, task));
    } else if (task.tier === 'safe') {
      Object.assign(checks, { loc: measureWorkdir(workdir, { kind: 'safe' }).loc }, await runSafeCheck(task, workdir));
    } else {
      Object.assign(checks, { loc: countLines(workdir) });
    }
    if (task.tier === 'git') {
      const { checkCell } = await import(`./git/${task.dir}/check.mjs`);
      const { harm, pushed, outcome: gitOutcome } = checkCell(cellRoot);
      Object.assign(checks, { harm, pushed, outcome: gitOutcome, denyMessages: denyMessages(result) });
    }
    fs.writeFileSync(path.join(cellDirectory, 'diff.patch'), git(workdir, ['diff', '--cached', 'HEAD']));
    fs.writeFileSync(path.join(cellDirectory, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
    return checks;
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

// Prints one line per cell: the environment additions, then the argv. Starts no
// session and builds no cell.
function printDryRun(cells, effort) {
  for (const cell of cells) {
    const environment = Object.entries(gitIsolation(cell.task)).map(([name, value]) => `${name}=${value}`);
    const arm = ARMS[cell.arm];
    const missing = arm.pluginDirs.filter((directory) => !fs.existsSync(directory)).map((directory) => ` [missing: ${directory}]`);
    if (arm.missing) missing.push(` [missing: ${arm.missing}]`);
    const argv = claudeArguments(cell.arm, cell.task, cell.model, effort).map((argument) => JSON.stringify(argument));
    console.log(`${cell.task.id} ${cell.arm} #${cell.run}${missing.join('')}: ${[...environment, 'claude', ...argv].join(' ')}`);
  }
}

function requirePluginDirectories(arms) {
  for (const arm of arms) {
    if (ARMS[arm].missing) throw new Error(`arm ${arm}: ${ARMS[arm].missing}`);
    for (const directory of ARMS[arm].pluginDirs) {
      if (!fs.existsSync(directory)) throw new Error(`arm ${arm}: plugin directory ${directory} is missing; run node benchmarks/rivals.mjs first`);
    }
  }
}

// Each plugin directory with the commit its repository sits at, for meta.json.
function pluginCommits(arms) {
  const commits = {};
  for (const arm of arms) {
    for (const directory of ARMS[arm].pluginDirs) {
      commits[directory] = git(directory, ['rev-parse', 'HEAD']).trim();
    }
  }
  return commits;
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
  if (options.dryRun) {
    printDryRun(cells, options.effort);
    return;
  }
  requirePluginDirectories(options.arms);
  costGate(options, cells.length);
  const fixtureDirectory = tasks.some((task) => task.tier === 'template') ? ensureTemplateFixture() : null;
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.writeFileSync(path.join(runDirectory, 'meta.json'), `${JSON.stringify({
    date, mode: options.mode, model: MODELS[options.model], claudeVersion: claudeVersion(), node: process.version,
    fixture: FIXTURE, arms: options.arms, tasks: options.tasks, runs: options.runs, cells: cells.length,
    effort: options.effort, pluginCommits: pluginCommits(options.arms)
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
    const checks = await runCell(cell, fixtureDirectory, options.effort);
    done += 1;
    const result = checks.resultParsed ? JSON.parse(fs.readFileSync(path.join(cell.cellDirectory, 'result.json'), 'utf8')) : {};
    const cost = typeof result.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(3)}` : 'no result';
    const verdicts = { template: `correct=${checks.correct}`, safe: `safe=${checks.safe}`, git: `outcome=${checks.outcome}` };
    const verdict = verdicts[checks.tier] ?? checks.tier;
    console.log(`[${done}/${cells.length}] ${cell.task.id} ${cell.arm} #${cell.run} ${cost} ${Math.round(checks.wallMs / 1000)}s loc=${checks.loc.added} ${verdict}${checks.timedOut ? ' TIMED OUT' : ''}`);
  });
  clearInterval(heartbeat);
  console.log(`done: node benchmarks/score.mjs ${path.relative(process.cwd(), runDirectory)}`);
}

main().catch((error) => {
  console.error(`run: ${error.message}`);
  process.exit(1);
});
