// benchmarks/value.mjs
// The value tier: tasks a user would bring, each in benchmarks/value/<slug>/
// with task.json, prompt.md, seed/, an optional setup.mjs, hidden/, solution/
// and check.mjs. A cell starts from seed/ as one commit, gets hidden/ only
// after its session, and is scored by the one JSON line check.mjs prints.
// README.md's "Value tier" section holds the contract.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { LOCAL_FILE } from '../lib/settings-store.mjs';
import { countLines } from './cell-checks.mjs';

export const VALUE_ROOT = fileURLToPath(new URL('./value/', import.meta.url));
export const GIT_IDENTITY = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com'];
// exo's options for every value cell, in its machine-local layer: commit on the
// checked-out branch and let nothing leave the cell, so exo never stops to ask.
export const EXO_SETTINGS = { workspace: 'current', ship: 'local' };
export const DEFAULT_ESTIMATE_USD = 1.5;
// A check may run the hidden tests, so it gets longer than a safe check.
const CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const START_INDEX = 'bench-start-index';
// What a task keeps from the session: the cell repo must never hold these, and
// the plugin copy a value cell loads must hold none of them either.
const TASK_INTERNALS = ['hidden', 'solution', 'check.mjs'];
// Top-level entries of this checkout that exo itself does not need and that
// hold task internals (benchmarks/value/*/hidden and solution) or only noise.
const PLUGIN_COPY_EXCLUDES = new Set(['benchmarks', 'tests', 'tmp', 'docs', '.worktrees', '.git', '.exo', 'node_modules']);

function git(repo, args, environment = process.env) {
  return execFileSync('git', ['-C', repo, ...GIT_IDENTITY, ...args], { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
}

// A seed or a setup.mjs that wrote hidden/, solution/ or check.mjs into the cell
// repo would hand the model the answer before its session ends.
function rejectTaskInternals(folder, label) {
  for (const name of TASK_INTERNALS) {
    if (fs.existsSync(path.join(folder, name))) throw new Error(`${label} holds ${name}, which a session must never see`);
  }
}

function readValueTask(directory) {
  const slug = path.basename(directory);
  const spec = JSON.parse(fs.readFileSync(path.join(directory, 'task.json'), 'utf8'));
  if (spec.id !== `value-${slug}`) throw new Error(`${directory}/task.json: id must be value-${slug}`);
  if (!(spec.timeoutMinutes > 0)) throw new Error(`${directory}/task.json: timeoutMinutes must be a positive number`);
  if (spec.maxBudgetUsd !== undefined && !(spec.maxBudgetUsd > 0)) throw new Error(`${directory}/task.json: maxBudgetUsd must be a positive number`);
  rejectTaskInternals(path.join(directory, 'seed'), 'seed');
  return { ...spec, directory, prompt: fs.readFileSync(path.join(directory, 'prompt.md'), 'utf8').trim() };
}

// Every task directory under root; a task.json that breaks the contract stops
// the run before a cell spends anything.
export function loadValueTasks(root = VALUE_ROOT) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readValueTask(path.join(root, entry.name)));
}

// A copy of the plugin at root without benchmarks/, tests/, tmp/, docs/ and the
// other entries of PLUGIN_COPY_EXCLUDES, so the exo arm of a value cell loads
// exo from a folder that holds no hidden/ or solution/. Made once per run.
export function copyPluginWithoutTasks(root, destination) {
  fs.cpSync(root, destination, {
    recursive: true,
    filter: (source) => !PLUGIN_COPY_EXCLUDES.has(path.relative(root, source).split(path.sep)[0])
  });
  return destination;
}

function writeExoSettings(repo) {
  fs.mkdirSync(path.join(repo, path.dirname(LOCAL_FILE)), { recursive: true });
  fs.writeFileSync(path.join(repo, LOCAL_FILE), `${JSON.stringify(EXO_SETTINGS, null, 2)}\n`);
  const info = path.join(repo, '.git', 'info');
  fs.mkdirSync(info, { recursive: true });
  fs.appendFileSync(path.join(info, 'exclude'), `/${LOCAL_FILE.split(path.sep).join('/')}\n/.exo/\n`);
}

// Builds the cell repo in an empty repo directory: seed/ as the initial commit,
// exo's settings, then setup.mjs when the task has one. Returns the tree of the
// state the session starts from, staged through a separate index so the
// repo's own index stays as setup.mjs left it.
export function prepareValueRepo(task, repo) {
  fs.cpSync(path.join(task.directory, 'seed'), repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  writeExoSettings(repo);
  const setup = path.join(task.directory, 'setup.mjs');
  if (fs.existsSync(setup)) execFileSync(process.execPath, [setup, repo], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  rejectTaskInternals(repo, `cell repo ${repo}`);
  const startIndex = { ...process.env, GIT_INDEX_FILE: path.join(repo, '.git', START_INDEX) };
  git(repo, ['add', '-A'], startIndex);
  const tree = git(repo, ['write-tree'], startIndex).trim();
  fs.rmSync(startIndex.GIT_INDEX_FILE);
  return tree;
}

// check.mjs prints one JSON line; anything else is the harness's error, which
// a cell records apart from a fail.
function checkVerdict(stdout, stderr, code, signal) {
  const harnessError = (reason) => ({ harnessError: `${reason}: ${(stderr || stdout).trim().slice(-300)}` });
  if (code !== 0) return harnessError(signal === null ? `check.mjs exited ${code}` : `check.mjs killed by ${signal}`);
  let verdict;
  try {
    verdict = JSON.parse(stdout.trim());
  } catch {
    return harnessError('check.mjs printed something other than one JSON line');
  }
  const { pass, defects, total, detail } = verdict ?? {};
  if (typeof pass !== 'boolean' || !Number.isInteger(defects) || !Number.isInteger(total) || !Array.isArray(detail)) {
    return harnessError('check.mjs JSON lacks a boolean pass, integer defects and total, or a detail array');
  }
  return { pass, defects, total, detail };
}

// The environment check.mjs runs in: a check that runs `node --test` or
// `npm test` inside a `node --test` parent would inherit NODE_TEST_CONTEXT and
// print no result it can parse, so no NODE_TEST_* variable reaches it.
function checkEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST_')));
}

function runValueCheck(task, repo) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(task.directory, 'check.mjs'), repo], { cwd: repo, env: checkEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), CHECK_TIMEOUT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(checkVerdict(stdout, stderr, code, signal));
    });
  });
}

// What the session left against startTree, committed and uncommitted, counted
// before hidden/ is copied in; then hidden/ over the repo and check.mjs's verdict.
// countLines stages everything to count it; the index goes back to HEAD so the
// check sees the repo as the session left it, not a new file as a tracked change.
export async function scoreValueRepo(task, repo, startTree) {
  const loc = countLines(repo, startTree);
  git(repo, ['reset', '-q']);
  const hidden = path.join(task.directory, 'hidden');
  if (fs.existsSync(hidden)) fs.cpSync(hidden, repo, { recursive: true, force: true });
  return { loc, ...(await runValueCheck(task, repo)) };
}

// The folders of every worktree registered in repo besides repo itself, as a
// build wave cut off by the timeout leaves them beside the cell root.
export function linkedWorktrees(repo) {
  const folders = git(repo, ['worktree', 'list', '--porcelain']).split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
  return folders.slice(1);
}

// The mean total_cost_usd of every finished cell under runsDirectory, keyed by
// task, arm and model id as its checks.json records them.
function pastCellCosts(runsDirectory) {
  const costs = new Map();
  if (!fs.existsSync(runsDirectory)) return costs;
  for (const file of fs.readdirSync(runsDirectory, { recursive: true })) {
    if (path.basename(file) !== 'checks.json') continue;
    const resultFile = path.join(runsDirectory, path.dirname(file), 'result.json');
    if (!fs.existsSync(resultFile)) continue;
    const cost = JSON.parse(fs.readFileSync(resultFile, 'utf8')).total_cost_usd;
    if (typeof cost !== 'number') continue;
    const checks = JSON.parse(fs.readFileSync(path.join(runsDirectory, file), 'utf8'));
    const key = `${checks.task}\t${checks.arm}\t${checks.model}`;
    costs.set(key, [...(costs.get(key) ?? []), cost]);
  }
  return new Map([...costs].map(([key, values]) => [key, values.reduce((sum, value) => sum + value, 0) / values.length]));
}

// Each planned cell ({ task, arm, modelId }) costs the mean of its finished
// twins under runsDirectory, else its task's estimateUsd, else the default.
export function projectCost(cells, runsDirectory) {
  const past = pastCellCosts(runsDirectory);
  const projection = { total: 0, fromRuns: 0, fromTask: 0, fromDefault: 0 };
  for (const { task, arm, modelId } of cells) {
    const key = `${task.id}\t${arm}\t${modelId}`;
    if (past.has(key)) {
      projection.total += past.get(key);
      projection.fromRuns += 1;
    } else if (typeof task.estimateUsd === 'number') {
      projection.total += task.estimateUsd;
      projection.fromTask += 1;
    } else {
      projection.total += DEFAULT_ESTIMATE_USD;
      projection.fromDefault += 1;
    }
  }
  return projection;
}
