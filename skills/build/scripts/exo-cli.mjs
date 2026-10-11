#!/usr/bin/env node
// The terminal front of run-plan.mjs.
//
//   node exo-cli.mjs run [plan] [run-plan flags]
//   node exo-cli.mjs run <plan> --detach | run --resume <id>
//   node exo-cli.mjs approve <id>
//   node exo-cli.mjs status [<id>]
//   node exo-cli.mjs run config [<key> <value>]
//   node exo-cli.mjs setup
//
// `setup` writes the ~/.local/bin/exo launcher; `run config` shows or sets the
// personal run.json.
//
// Works from the git root of the cwd. With no plan it takes the newest
// docs/specs/*.md or docs/plans/*.md that is not a *-decisions.md file. It
// refuses a checkout with uncommitted edits (exit 2), fetches and fast-forwards
// the default branch (a remote-less checkout skips this; a diverged default
// branch refuses only when the plan branch must be created from it), puts the
// checkout on the plan's Branch: (created from the default branch when
// missing; when the checkout is the one the plugin-root pointer names, the
// checkout stays on the default branch and the Branch: is built in a worktree
// under .worktrees/, so its sessions load that checkout's exo), deletes local branches merged into the default branch whose
// upstream is gone, then runs run-plan.mjs with inherited stdio and exits with
// its code. When the plan has a Land: line and run-plan passes, land-run.mjs
// lands the run (phase landing, then landed, or parked on an open gate in
// gates.md; exit 3 for parked); `approve <id>` approves a parked run's open
// gates and continues it like --resume, by stage (build reruns run-plan,
// landing runs land-run only). Every final phase writes report.md and sends a
// desktop notification. --dry-run and --help skip the fetch, fast-forward and deletion.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, frameOf, parsePlan } from '#plan-tasks';
import { readDecisions } from '#run-decision';
import { isMain } from '#script-flags';
import { configDir, loadRunConfig, readKeys } from './run-config.mjs';
import { landRun } from './land-run.mjs';
import { FINAL_PHASES, acquireLock, approveGates, readGates, createRun, isAlive, listRuns, newRunId, readState, releaseLock, removeRun, runDir, updateRun } from './run-state.mjs';

const CLI = fileURLToPath(import.meta.url);
const RUN_PLAN = fileURLToPath(new URL('./run-plan.mjs', import.meta.url));

class Refusal extends Error {}

function gitOut(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

/** The docs/specs or docs/plans *.md with the newest mtime that does not end in -decisions.md; null with none. */
function newestPlan(root) {
  const plans = ['specs', 'plans'].flatMap((folder) => {
    let names = [];
    try {
      names = fs.readdirSync(path.join(root, 'docs', folder));
    } catch {
      return [];
    }
    return names
      .filter((name) => name.endsWith('.md') && !name.endsWith('-decisions.md'))
      .map((name) => path.join(root, 'docs', folder, name));
  });
  return plans.map((file) => ({ file, time: fs.statSync(file).mtimeMs })).sort((a, b) => b.time - a.time)[0]?.file ?? null;
}

function dirtyFiles(root) {
  const answer = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.split('\n').filter(Boolean).map((line) => line.slice(3)) : [];
}

function putOnBranch(root, wanted) {
  if (gitOut(root, ['symbolic-ref', '-q', '--short', 'HEAD']) === wanted) return;
  const exists = gitOut(root, ['rev-parse', '-q', '--verify', `refs/heads/${wanted}`]) !== null;
  let args = ['switch', wanted];
  if (!exists) {
    const base = defaultBranch(root);
    if (base === null) throw new Refusal(`branch ${wanted} is missing and the checkout has no default branch to create it from`);
    args = ['switch', '-c', wanted, base];
  }
  const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (done.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${done.stderr.trim()}`);
}

/** The path of a worktree for `wanted` under `<root>/.worktrees/`, reused when one holds the branch, else added (the branch created from the default branch when missing). */
function worktreeFor(root, wanted) {
  const held = worktrees(root).find((tree) => tree.branch === wanted);
  if (held?.main) throw new Refusal(`branch ${wanted} is checked out in the main checkout ${held.path}, which the loaded exo runs from; run git switch ${defaultBranch(root) ?? '<default branch>'} there first`);
  if (held !== undefined) return held.path;
  const where = path.join(root, '.worktrees', wanted.replaceAll('/', '-'));
  const exists = gitOut(root, ['rev-parse', '-q', '--verify', `refs/heads/${wanted}`]) !== null;
  const base = defaultBranch(root);
  if (!exists && base === null) throw new Refusal(`branch ${wanted} is missing and the checkout has no default branch to create it from`);
  const args = exists ? ['worktree', 'add', where, wanted] : ['worktree', 'add', '-b', wanted, where, base];
  const done = git(root, args);
  if (!done.ok) throw new Refusal(`git ${args.join(' ')} failed: ${done.error}`);
  return where;
}

/** True when `root` is the checkout the plugin-root pointer names; false with no readable pointer. */
function isPluginCheckout(root) {
  try {
    const pointer = fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo', 'plugin-root'), 'utf8').split('\n')[0];
    return fs.realpathSync(pointer) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

function git(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: answer.status === 0, text: answer.stdout.trim(), error: answer.stderr.trim().split('\n')[0] };
}

/** Linked-or-main worktrees as { path, branch, main }; branch is null when detached. */
function worktrees(root) {
  const list = git(root, ['worktree', 'list', '--porcelain']).text.split('\n\n').filter(Boolean);
  return list.map((block, index) => ({
    path: /^worktree (.+)$/m.exec(block)[1],
    branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null,
    main: index === 0
  }));
}

/** Fetches, then fast-forwards the local default branch to its upstream; no remote skips, a diverged branch refuses when `needed` (the plan branch is created from it), else warns. */
function updateDefault(root, base, needed) {
  if (git(root, ['remote']).text === '') return;
  if (!git(root, ['fetch', '--prune']).ok) {
    process.stdout.write('exo: git fetch failed; going on with the local default branch\n');
    return;
  }
  const upstream = git(root, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${base}`]).text;
  const local = git(root, ['rev-parse', '-q', '--verify', `refs/heads/${base}`]).text;
  if (upstream === '' || local === '' || upstream === local) return;
  if (git(root, ['merge-base', '--is-ancestor', upstream, local]).ok) return;
  if (!git(root, ['merge-base', '--is-ancestor', local, upstream]).ok) {
    if (!needed) {
      process.stdout.write(`exo: warning: ${base} and origin/${base} have diverged; going on with the existing plan branch\n`);
      return;
    }
    throw new Refusal(`refused: ${base} and origin/${base} have diverged; rebase or reset ${base} onto origin/${base} yourself, then rerun exo run`);
  }
  const holder = worktrees(root).find((tree) => tree.branch === base);
  const moved = holder === undefined
    ? git(root, ['update-ref', '-m', 'exo: fast-forward', `refs/heads/${base}`, upstream, local])
    : git(holder.path, ['merge', '--ff-only', upstream]);
  if (!moved.ok) throw new Refusal(`refused: could not fast-forward ${base} to origin/${base}: ${moved.error}`);
  process.stdout.write(`exo: fast-forwarded ${base} to origin/${base}\n`);
}

/** Deletes local branches merged into `base` whose upstream is gone (git branch -d); skips `keep` and any branch checked out in a worktree. */
function cleanUp(root, base, keep) {
  git(root, ['worktree', 'prune']);
  const merged = git(root, ['branch', '--merged', base, '--format=%(refname:short)']).text.split('\n').filter(Boolean);
  const gone = git(root, ['for-each-ref', '--format=%(refname:short)\t%(upstream:track)', 'refs/heads']).text
    .split('\n').filter((line) => line.endsWith('\t[gone]')).map((line) => line.split('\t')[0]);
  const checkedOut = worktrees(root).map((tree) => tree.branch);
  for (const name of merged) {
    if (name === base || keep.includes(name) || !gone.includes(name) || checkedOut.includes(name)) continue;
    const deleted = git(root, ['branch', '-d', name]);
    process.stdout.write(deleted.ok ? `exo: removed branch ${name}\n` : `exo: kept branch ${name}: ${deleted.error}\n`);
  }
}

const LAUNCHER = [
  '#!/bin/sh',
  'root=$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root") && exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"',
  ''
].join('\n');

function setupCommand() {
  const home = os.homedir();
  const bin = path.join(home, '.local', 'bin');
  const target = path.join(bin, 'exo');
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== LAUNCHER) {
    throw new Refusal(`refused: ${target} already exists and is not the exo launcher; move it, then rerun exo setup`);
  }
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(target, LAUNCHER, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  fs.mkdirSync(configDir(home), { recursive: true });
  process.stdout.write([
    `exo: launcher ${target}`,
    `exo: keys file ${path.join(configDir(home), 'keys.env')}; copy in the lines for the providers you use:`,
    'DEEPSEEK_API_KEY=',
    'ZAI_API_KEY=',
    ''
  ].join('\n'));
  if (!(process.env.PATH ?? '').split(path.delimiter).includes(bin)) {
    process.stdout.write(`exo: warning: ${bin} is not on PATH; add it to your shell profile\n`);
  }
}

/** Leaf settings as [dotted path, value] pairs; arrays are leaves. */
function leaves(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
}

function has(object, dotted) {
  let at = object;
  for (const key of dotted.split('.')) {
    if (at === null || typeof at !== 'object' || !(key in at)) return false;
    at = at[key];
  }
  return true;
}

function readUserConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Refusal(`cannot read ${file}: ${error.message}`);
  }
}

function configCommand(args) {
  const home = os.homedir();
  const file = path.join(configDir(home), 'run.json');
  if (args.length === 0) {
    const user = readUserConfig(file);
    const merged = loadRunConfig({ home });
    for (const [key, value] of leaves(merged)) {
      process.stdout.write(`${key} = ${JSON.stringify(value)} (${has(user, key) ? 'run.json' : 'catalog'})\n`);
    }
    const keys = readKeys(path.join(configDir(home), 'keys.env'));
    for (const [name, entry] of Object.entries(merged.providers)) {
      if (entry.key) process.stdout.write(`key ${entry.key} (${name}): ${keys[entry.key] ? 'set' : 'missing'}\n`);
    }
    return;
  }
  if (args.length !== 2) throw new Refusal('usage: exo run config [<key> <value>]');
  const [key, raw] = args;
  let value = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // not JSON: keep the text
  }
  const user = readUserConfig(file);
  user[key] = value;
  fs.mkdirSync(configDir(home), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(user, null, 2)}\n`);
  process.stdout.write(`exo: ${key} = ${JSON.stringify(value)} written to ${file}\n`);
}

/** Takes `--detach`, `--resume <id>` and the internal `--run-id <id>` out of `argv`. */
function runOptions(argv) {
  const rest = [];
  const options = { detach: false, resume: null, runId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--detach') options.detach = true;
    else if (argv[i] === '--resume' || argv[i] === '--run-id') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Refusal(`${argv[i - 1]} needs a run id`);
      options[argv[i - 1] === '--resume' ? 'resume' : 'runId'] = value;
    } else rest.push(argv[i]);
  }
  return { ...options, rest };
}

/** Preflight and chores, then run-plan with inherited stdio; its exit code with where the landing step goes (`land` null: no landing). */
function buildRun(root, plan, flags, id) {
  const files = dirtyFiles(root);
  if (files.length > 0) {
    const list = files.join(' ');
    throw new Refusal(`refused: uncommitted edits in ${list}; commit them, or discard with git restore --staged --worktree -- ${list}`);
  }

  const { branch, land } = planFrame(plan);
  const base = defaultBranch(root);
  const chores = base !== null && !flags.some((flag) => flag === '--dry-run' || flag === '--help');
  const missing = branch !== null && gitOut(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`]) === null;
  if (chores) updateDefault(root, base, missing);
  const inTree = branch !== null && isPluginCheckout(root);
  let runRoot = root;
  if (inTree) runRoot = worktreeFor(root, branch);
  else if (branch !== null) putOnBranch(root, branch);
  if (chores) cleanUp(root, base, [branch, gitOut(root, ['symbolic-ref', '-q', '--short', 'HEAD'])]);

  const rootFlags = inTree ? ['--root', runRoot] : [];
  const env = { ...process.env, EXO_RUN: id, EXO_RUN_DIR: runDir(root, id) };
  const done = spawnSync(process.execPath, [RUN_PLAN, plan, ...rootFlags, ...flags], { cwd: runRoot, stdio: 'inherit', env });
  const preview = flags.some((flag) => flag === '--dry-run' || flag === '--help');
  return { code: done.status ?? null, runRoot, branch, land: preview ? null : land };
}

function planFrame(plan) {
  try {
    return frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame);
  } catch (error) {
    throw new Refusal(`cannot read ${plan}: ${error.message}`);
  }
}

/** land-run for the run's stored build checkout and branch. */
function landStage(root, id, plan) {
  const state = readState(root, id);
  const frame = planFrame(plan);
  const result = landRun({
    root, runRoot: state.runRoot ?? root, branch: state.branch ?? frame.branch, mode: frame.land, runDir: runDir(root, id),
    success: frame.successCriterion ?? '', startedAt: state.startedAt
  });
  process.stdout.write(`exo: ${result.phase === 'landed' ? `landed ${result.range ?? ''} ${result.prUrl ?? ''}`.trim() : `parked: ${result.gate}; exo approve ${id}`}\n`);
  return result;
}

/** report.md in the run dir, at most 15 lines. */
function writeReport(root, id, phase, result) {
  const state = readState(root, id);
  let land = null;
  try {
    land = planFrame(state.plan).land;
  } catch {
    // an unreadable plan leaves the line at none
  }
  const dir = runDir(root, id);
  const open = readGates(dir).filter((gate) => gate.status === 'open');
  const lines = [
    `# exo run ${id}`,
    `Phase: ${phase}`,
    `Land: ${land ?? 'none'}`,
    `Branch: ${state.branch ?? 'none'}`,
    `Landed: ${result?.range ?? 'none'}`,
    `Pushed: ${result?.prUrl ?? result?.pushed ?? 'none'}`,
    `Open gates: ${open.length}`,
    ...open.slice(0, 4).map((gate) => `- ${gate.source}: ${gate.action} (${gate.reason})`),
    `Decisions: ${readDecisions(dir).length}`,
    `Cleanup: ${result?.cleanup ?? 'none'}`
  ];
  fs.writeFileSync(path.join(dir, 'report.md'), `${lines.slice(0, 15).join('\n')}\n`);
}

/** A desktop notification; no osascript is ignored. */
function notify(id, phase) {
  spawnSync('osascript', ['-e', `display notification "exo run ${id.replace(/[^\w.-]/g, '')}: ${phase}" with title "exo"`], { stdio: 'ignore' });
}

function runCommand(argv, { approving = false } = {}) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  const options = runOptions(argv);
  let { detach } = options;
  let plan;
  let flags;
  let id = options.runId ?? options.resume ?? newRunId();
  let old = null;
  if (options.resume !== null) {
    old = readState(root, id);
    if (old === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
    if (old.phase === 'passed') throw new Refusal(`refused: run ${id} already passed`);
    if (old.phase === 'landed') throw new Refusal(`refused: run ${id} already landed`);
    if (old.phase === 'parked' && !approving) throw new Refusal(`refused: run ${id} is parked; use exo approve ${id}`);
    if (isAlive(old.pid) && !FINAL_PHASES.includes(old.phase)) throw new Refusal(`refused: run ${id} is still running (pid ${old.pid})`);
    ({ plan, flags, detach } = old);
  } else {
    const given = options.rest[0] !== undefined && !options.rest[0].startsWith('--');
    flags = given ? options.rest.slice(1) : options.rest;
    plan = given ? path.resolve(options.rest[0]) : newestPlan(root);
    if (plan === null) throw new Refusal('no plan under docs/specs/ or docs/plans/; pass one: exo run <plan>');
    if (!given && options.runId === null) process.stdout.write(`exo: plan ${plan}\n`);
    if (!fs.existsSync(plan)) throw new Refusal(`cannot read ${plan}: no such file`);
  }

  const child = options.runId !== null;
  if (!child) {
    // State with this pid first, then the lock, so a contender never reads the lock as stale.
    const log = detach ? path.join(runDir(root, id), 'run.log') : null;
    if (old !== null) updateRun(root, id, { phase: 'starting', exitCode: null, pid: process.pid, log });
    else createRun(root, { id, plan, flags, detach, log });
    const lock = acquireLock(root, id);
    if (!lock.ok) {
      if (old !== null) updateRun(root, id, { phase: old.phase, exitCode: old.exitCode, pid: old.pid, log: old.log });
      else removeRun(root, id);
      throw new Refusal(`refused: run ${lock.holder} is still running in this checkout; exo status shows it`);
    }
    if (lock.stale) process.stdout.write(`exo: took over the lock of run ${lock.stale}, whose process is gone\n`);
  }

  if (approving && !child) {
    const approved = approveGates(runDir(root, id));
    if (!detach) process.stdout.write(`exo: approved ${approved} gate(s) of run ${id}; continuing\n`);
  }

  if (detach && !child) {
    const log = path.join(runDir(root, id), 'run.log');
    const fd = fs.openSync(log, 'a');
    const started = spawn(process.execPath, [CLI, 'run', plan, '--run-id', id, ...flags], { cwd: root, detached: true, stdio: ['ignore', fd, fd] });
    started.unref();
    fs.closeSync(fd);
    updateRun(root, id, { pid: started.pid });
    process.stdout.write(`exo: run ${id} started in the background (pid ${started.pid}); exo status ${id}, log ${log}\n`);
    return 0;
  }

  let code = 1;
  let phase = 'crashed';
  let result = null;
  try {
    if (readState(root, id).stage === 'landing') result = landStage(root, id, plan);
    else {
      const built = buildRun(root, plan, flags, id);
      code = built.code ?? 1;
      phase = code === 0 ? 'passed' : code === 2 ? 'refused' : code === 3 ? 'parked' : 'stopped';
      if (code === 0 && built.land !== null) {
        updateRun(root, id, { phase: 'landing', stage: 'landing', runRoot: built.runRoot, branch: built.branch });
        result = landStage(root, id, plan);
      }
    }
    if (result !== null) {
      phase = result.phase;
      code = phase === 'landed' ? 0 : 3;
    }
  } catch (error) {
    if (error instanceof Refusal) {
      phase = 'refused';
      code = 2;
    }
    throw error;
  } finally {
    updateRun(root, id, { phase, exitCode: code });
    releaseLock(root, id);
    try {
      writeReport(root, id, phase, result);
    } catch {
      // the report is a convenience; the state already holds the outcome
    }
    notify(id, phase);
  }
  return code;
}

function approveCommand(args) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal('usage: exo approve <id>');
  const state = readState(root, id);
  if (state === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  if (state.phase !== 'parked') throw new Refusal(`refused: run ${id} is ${state.phase}, not parked`);
  return runCommand(['--resume', id], { approving: true });
}

function statusCommand(args) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  const runs = args[0] === undefined ? listRuns(root) : [readState(root, args[0])].filter(Boolean);
  if (runs.length === 0) throw new Refusal(args[0] === undefined ? 'no runs in this checkout' : `no run ${args[0]} in this checkout`);
  for (const run of runs) {
    const gone = !FINAL_PHASES.includes(run.phase) && !isAlive(run.pid);
    const note = run.phase === 'parked' ? `; exo approve ${run.id}` : gone ? `; process gone, continue with: exo run --resume ${run.id}` : '';
    process.stdout.write(`${run.id}  ${run.phase}  ${path.basename(run.plan)}  pid ${run.pid}${run.log ? `  log ${run.log}` : ''}${note}\n`);
    for (const gate of readGates(runDir(root, run.id)).filter((g) => g.status === 'open')) {
      process.stdout.write(`  open gate: ${gate.source}: ${gate.action} (${gate.reason})\n`);
    }
  }
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'setup') setupCommand();
    else if (command === 'run' && rest[0] === 'config') configCommand(rest.slice(1));
    else if (command === 'approve') process.exitCode = approveCommand(rest);
    else if (command === 'status') statusCommand(rest);
    else if (command === 'run') process.exitCode = runCommand(rest);
    else throw new Refusal('usage: exo run [plan] [--detach] [run-plan flags] | exo run --resume <id> | exo approve <id> | exo status [<id>] | exo run config [<key> <value>] | exo setup');
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
