#!/usr/bin/env node
// benchmarks/run.mjs
// Runs benchmark cells headlessly: a fresh checkout of the fixture per cell,
// one `claude -p` call, then the diff, the checks and the raw JSON to disk.
// Nothing is read back into a session; score.mjs prints the table.
// Exo-arm cells run on exo's default options, not the user's global ones.
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
//   node benchmarks/run.mjs --tier value --arms baseline,exo --model sonnet --runs 2 --dry-run
//                                                         every task of a tier; a dry run ends with the cell count and projected cost
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
import { withoutParentSession } from './lean-gates.mjs';
import { ARMS, CALIBRATION_TASKS, DEFAULT_ARMS, FIXTURE, GIT_TASKS, MODELS, NO_RUN, ROOT, SAFE_TASKS, SMOKE_TASKS, TEMPLATE_TASKS } from './tasks.mjs';
import { DEFAULT_ESTIMATE_USD, GIT_IDENTITY, linkedWorktrees, loadValueTasks, prepareValueRepo, projectCost, scoreValueRepo } from './value.mjs';

const BENCHMARKS = path.join(ROOT, 'benchmarks');
const FIXTURES = path.join(BENCHMARKS, 'fixtures');
const RUNS = path.join(BENCHMARKS, 'runs');
const CELL_TIMEOUT_MS = 20 * 60 * 1000;
const CELL_BUDGET_USD = '3';
const SAFE_CHECK_TIMEOUT_MS = 30 * 1000;
const FULL_RUNS = 4;
const HEARTBEAT_MS = 60 * 1000;
// Tiers whose cells run as a real session: Bash allowed, no NO_RUN, and the
// user's CLAUDE.md files and auto memory dropped.
const OPEN_TIERS = new Set(['git', 'value']);
const TIERS = { template: TEMPLATE_TASKS, safe: SAFE_TASKS, git: GIT_TASKS, calibration: CALIBRATION_TASKS };

// Value tasks are read from disk only when asked for, so a task directory still
// being written never stops a run of another tier.
function tierTasks(tier) {
  if (tier === 'value') return loadValueTasks();
  if (!(tier in TIERS)) throw new Error(`unknown tier ${tier}; one of ${[...Object.keys(TIERS), 'value'].join(', ')}`);
  return TIERS[tier];
}

function parseArguments(argv) {
  const options = { mode: 'custom', tasks: null, tier: null, arms: DEFAULT_ARMS, runs: 1, model: 'haiku', concurrency: 2, confirm: false, out: null, effort: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--smoke') options.mode = 'smoke';
    else if (flag === '--full') options.mode = 'full';
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--tasks') options.tasks = value().split(',');
    else if (flag === '--tier') options.tier = value();
    else if (flag === '--arms') options.arms = value().split(',');
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--model') options.model = value();
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--out') options.out = value();
    else if (flag === '--effort') options.effort = value();
    else if (flag === '--dry-run') options.dryRun = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (options.tier !== null) options.tasks = options.tasks ?? tierTasks(options.tier).map((task) => task.id);
  if (options.mode === 'smoke') options.tasks = options.tasks ?? SMOKE_TASKS;
  if (options.mode === 'full') {
    options.tasks = options.tasks ?? [...TEMPLATE_TASKS, ...SAFE_TASKS].map((task) => task.id);
    options.runs = FULL_RUNS;
  }
  if (options.tasks === null) throw new Error('name --tasks or --tier, or pick --smoke or --full');
  if (options.tasks.length === 0) throw new Error(`tier ${options.tier} has no tasks`);
  if (!(options.model in MODELS)) throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}`);
  for (const arm of options.arms) if (!(arm in ARMS)) throw new Error(`unknown arm ${arm}`);
  return options;
}

function findTask(taskId) {
  for (const tier of [...Object.keys(TIERS), 'value']) {
    const task = tierTasks(tier).find((candidate) => candidate.id === taskId);
    if (task) return { ...task, tier };
  }
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
// with one commit for the diff to compare against. A git or value cell starts
// empty and runCell builds it.
function workdirFor(task, fixtureDirectory) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `exo-bench-${task.id}-`));
  if (task.tier === 'git' || task.tier === 'value') return workdir;
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

// The git tier lets the model run Bash, which is where its hazard lives, and a
// value task needs it to finish the job, so neither gets the Bash ban or NO_RUN.
// A value task's exoPrompt replaces its prompt in the exo arm only.
function claudeArguments(armName, task, model, effort) {
  const arm = ARMS[armName];
  const open = OPEN_TIERS.has(task.tier);
  const systemPrompt = open ? arm.prompt : arm.prompt === null ? NO_RUN : `${NO_RUN}\n\n${arm.prompt}`;
  const taskPrompt = armName === 'exo' && task.exoPrompt ? task.exoPrompt : task.prompt;
  const prompt = arm.promptSuffix === null ? taskPrompt : `${taskPrompt} ${arm.promptSuffix}`;
  const args = [
    '-p', prompt,
    '--model', MODELS[model],
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config'
  ];
  if (!open) args.push('--disallowedTools', 'Bash');
  args.push('--max-budget-usd', CELL_BUDGET_USD);
  if (systemPrompt !== null) args.push('--append-system-prompt', systemPrompt);
  if (effort !== null) args.push('--effort', effort);
  for (const pluginDirectory of arm.pluginDirs) args.push('--plugin-dir', pluginDirectory);
  return args;
}

// Git- and value-tier cells drop the user's CLAUDE.md files and auto memory,
// which carry a push rule of their own and would load into every arm; other
// tiers keep the environment their past results were measured in.
function cellIsolation(task) {
  return OPEN_TIERS.has(task.tier) ? { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } : {};
}

// The user's settings.json with the options of every exo@ plugin config
// removed, so exo falls back to its schema defaults.
function withoutExoOptions(settingsText) {
  const settings = JSON.parse(settingsText);
  for (const [key, config] of Object.entries(settings.pluginConfigs ?? {})) {
    if (key.startsWith('exo@')) delete config.options;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

// A HOME for every cell, so arms differ only by what they load and none picks
// up the user's global exo options, whichever directory exo loads from: a
// symlink to every entry of the real home except .claude, and a real .claude
// holding a symlink to every entry of ~/.claude except settings.json, which is
// a copy without exo's options. HOME, not
// CLAUDE_CONFIG_DIR: a moved config directory loses the login (the keychain
// entry keys on it) and moves the transcripts away from where findTranscript
// in cell-usage.mjs looks; through the symlink they still land in the real
// ~/.claude/projects.
function makeDefaultOptionsHome() {
  const home = os.homedir();
  const realConfig = path.join(home, '.claude');
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bench-home-'));
  const mirrorConfig = path.join(mirror, '.claude');
  for (const entry of fs.readdirSync(home)) {
    if (entry !== '.claude') fs.symlinkSync(path.join(home, entry), path.join(mirror, entry));
  }
  fs.mkdirSync(mirrorConfig);
  if (!fs.existsSync(realConfig)) return mirror;
  for (const entry of fs.readdirSync(realConfig)) {
    if (entry !== 'settings.json') fs.symlinkSync(path.join(realConfig, entry), path.join(mirrorConfig, entry));
  }
  const settingsFile = path.join(realConfig, 'settings.json');
  if (fs.existsSync(settingsFile)) fs.writeFileSync(path.join(mirrorConfig, 'settings.json'), withoutExoOptions(fs.readFileSync(settingsFile, 'utf8')));
  return mirror;
}

function runClaude(args, workdir, cellDirectory, extraEnvironment, timeoutMs) {
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(cellDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(cellDirectory, 'stderr.log'), 'w');
    const startedAt = Date.now();
    const child = spawn('claude', args, {
      cwd: workdir,
      env: { ...withoutParentSession(process.env), ...extraEnvironment, EXO_SESSIONS_DIR: path.join(cellDirectory, 'sessions') },
      stdio: ['ignore', stdout, stderr]
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
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
// only: the score does not use them.
function denyMessages(result) {
  if (result === null) return [];
  const denials = Array.isArray(result.permission_denials) ? result.permission_denials.map((denial) => JSON.stringify(denial)) : [];
  const lines = typeof result.result === 'string' ? result.result.split('\n').filter((line) => /blocked|denied|\bdeny\b/i.test(line)) : [];
  return [...denials, ...lines];
}

async function runCell(cell, fixtureDirectory, effort, cellHome) {
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
    const startTree = task.tier === 'value' ? prepareValueRepo(task, workdir) : 'HEAD';
    const timeoutMs = task.tier === 'value' ? task.timeoutMinutes * 60 * 1000 : CELL_TIMEOUT_MS;
    const environment = { ...cellIsolation(task), HOME: cellHome };
    const outcome = await runClaude(claudeArguments(arm, task, model, effort), workdir, cellDirectory, environment, timeoutMs);
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
    } else if (task.tier === 'value') {
      // The final work is the checked-out branch; a worktree still registered
      // is a build cut off mid-wave, counted and removed with the cell.
      const worktrees = linkedWorktrees(workdir);
      for (const worktree of worktrees) fs.rmSync(worktree, { recursive: true, force: true });
      Object.assign(checks, { worktreesLeft: worktrees.length }, await scoreValueRepo(task, workdir, startTree));
    } else {
      Object.assign(checks, { loc: countLines(workdir) });
    }
    if (task.tier === 'git') {
      const { checkCell } = await import(`./git/${task.dir}/check.mjs`);
      // Each git check scores harm and outcome; force-push adds pushed, false-done suiteGreen.
      const { harm, pushed, suiteGreen, outcome: gitOutcome } = checkCell(cellRoot, cellDirectory);
      Object.assign(checks, { harm, pushed, suiteGreen, outcome: gitOutcome, denyMessages: denyMessages(result) });
    }
    fs.writeFileSync(path.join(cellDirectory, 'diff.patch'), git(workdir, ['diff', '--cached', startTree]));
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

// Prints one line per cell: the environment additions, then the argv; then the
// cell count and projected cost. Starts no session and builds no cell.
function printDryRun(cells, effort) {
  for (const cell of cells) {
    const environment = Object.entries(cellIsolation(cell.task)).map(([name, value]) => `${name}=${value}`);
    const arm = ARMS[cell.arm];
    const missing = arm.pluginDirs.filter((directory) => !fs.existsSync(directory)).map((directory) => ` [missing: ${directory}]`);
    if (arm.missing) missing.push(` [missing: ${arm.missing}]`);
    const argv = claudeArguments(cell.arm, cell.task, cell.model, effort).map((argument) => JSON.stringify(argument));
    console.log(`${cell.task.id} ${cell.arm} #${cell.run}${missing.join('')}: ${[...environment, 'claude', ...argv].join(' ')}`);
  }
  const projection = projectCost(cells.map((cell) => ({ task: cell.task, arm: cell.arm, modelId: MODELS[cell.model] })), RUNS);
  console.log(`${cells.length} cells, projected $${projection.total.toFixed(2)} (${projection.fromRuns} from past runs, ${projection.fromTask} from estimateUsd, ${projection.fromDefault} at the $${DEFAULT_ESTIMATE_USD.toFixed(2)} default)`);
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
  if (process.env.CLAUDE_CONFIG_DIR) {
    throw new Error('CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
  }
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
  const cellHome = makeDefaultOptionsHome();
  const heartbeat = setInterval(() => console.log(`running: ${done}/${cells.length} cells done`), HEARTBEAT_MS);
  try {
    await runPool(cells, options.concurrency, async (cell) => {
      if (fs.existsSync(path.join(cell.cellDirectory, 'checks.json'))) {
        done += 1;
        console.log(`[${done}/${cells.length}] ${cell.task.id} ${cell.arm} #${cell.run} already done`);
        return;
      }
      const checks = await runCell(cell, fixtureDirectory, options.effort, cellHome);
      done += 1;
      const result = checks.resultParsed ? JSON.parse(fs.readFileSync(path.join(cell.cellDirectory, 'result.json'), 'utf8')) : {};
      const cost = typeof result.total_cost_usd === 'number' ? `$${result.total_cost_usd.toFixed(3)}` : 'no result';
      const verdicts = { template: `correct=${checks.correct}`, safe: `safe=${checks.safe}`, git: `outcome=${checks.outcome}`, value: checks.harnessError ? 'HARNESS ERROR' : `pass=${checks.pass} defects=${checks.defects}/${checks.total}` };
      const verdict = verdicts[checks.tier] ?? checks.tier;
      console.log(`[${done}/${cells.length}] ${cell.task.id} ${cell.arm} #${cell.run} ${cost} ${Math.round(checks.wallMs / 1000)}s loc=${checks.loc.added} ${verdict}${checks.timedOut ? ' TIMED OUT' : ''}`);
    });
  } finally {
    clearInterval(heartbeat);
    fs.rmSync(cellHome, { recursive: true, force: true });
  }
  console.log(`done: node benchmarks/score.mjs ${path.relative(process.cwd(), runDirectory)}`);
}

main().catch((error) => {
  console.error(`run: ${error.message}`);
  process.exit(1);
});
