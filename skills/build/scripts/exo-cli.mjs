#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, frameOf, parsePlan } from '#plan-tasks';
import { readDecisions } from '#run-decision';
import { environmentMs, isMain } from '#script-flags';
import { layers, resolve as resolveSetting } from '#settings-store';
import { configDir, loadRunConfig, readKeys } from './run-config.mjs';
import { landRun } from './land-run.mjs';
import { FINAL_PHASES, acquireLock, approveGates, readGates, createRun, isAlive, keepRun, keptDir, listRuns, liveLogFile, newRunId, phaseForExit, readState, releaseLock, removeRun, runDir, updateRun } from './run-state.mjs';

const USAGE = 'usage: exo run [plan] [--detach] [run-plan flags] | exo run --resume <id> | exo approve <id> | exo status [<id>] | exo wait <id> | exo run config [<key> <value>] | exo setup';
const CLI = fileURLToPath(import.meta.url);
const RUN_PLAN = fileURLToPath(new URL('./run-plan.mjs', import.meta.url));
// why: a plan run with several tasks and 30-minute gates can take hours; the deadline only ends a wait nobody reads.
const WAIT_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1000;
const watchCommand = (id) => `node "${CLI}" wait ${id}`;

class Refusal extends Error {}

function gitOut(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

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
  if (resolveSetting('env', layers(root)).value === 'copy') copyEnvFiles(root, where);
  return where;
}

const ENV_NAME = /^\.env/;

export function envFileNames(names, pattern = ENV_NAME) {
  return names.filter((name) => pattern.test(name));
}

export function copyEnvFiles(root, where, pattern = ENV_NAME) {
  const files = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const copied = [];
  for (const name of envFileNames(files, pattern)) {
    if (!git(root, ['check-ignore', '-q', '--', name]).ok || fs.existsSync(path.join(where, name))) continue;
    fs.copyFileSync(path.join(root, name), path.join(where, name));
    copied.push(name);
  }
  return copied;
}

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

function worktrees(root) {
  const list = git(root, ['worktree', 'list', '--porcelain']).text.split('\n\n').filter(Boolean);
  return list.map((block, index) => ({
    path: /^worktree (.+)$/m.exec(block)[1],
    branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null,
    main: index === 0
  }));
}

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
  }
  const user = readUserConfig(file);
  user[key] = value;
  fs.mkdirSync(configDir(home), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(user, null, 2)}\n`);
  process.stdout.write(`exo: ${key} = ${JSON.stringify(value)} written to ${file}\n`);
}

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

async function buildRun(root, plan, flags, id) {
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
  const child = spawn(process.execPath, [RUN_PLAN, plan, ...rootFlags, ...flags], { cwd: runRoot, stdio: ['inherit', 'pipe', 'pipe'], env });
  // why: run-plan's lines pass through process.stdout.write and process.stderr.write, so teeToFile copies them to live.log.
  let outTail = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  // why: a signal to this process does not reach run-plan unless it is forwarded, so run-plan can end its claude group.
  const forward = (signal) => child.kill(signal);
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const signal of signals) process.on(signal, forward);
  const done = await new Promise((resolve) => {
    child.on('error', () => resolve({ status: null }));
    child.on('close', (status) => resolve({ status }));
  });
  for (const signal of signals) process.off(signal, forward);
  const preview = flags.some((flag) => flag === '--dry-run' || flag === '--help');
  // why: run-plan writes preflight refusals to stdout as `run-plan: refused: <message>` and usage errors to stderr as `run-plan: <message>`; other children write `exo: <message>`.
  const reasonLine = outTail.split('\n').filter((line) => /^(exo|run-plan): /.test(line)).pop();
  const reason = reasonLine === undefined ? null : reasonLine.replace(/^(exo|run-plan): (refused: )?/, '');
  return { code: done.status ?? null, runRoot, branch, land: preview ? null : land, reason };
}

function planFrame(plan) {
  try {
    return frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame);
  } catch (error) {
    throw new Refusal(`cannot read ${plan}: ${error.message}`);
  }
}

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

function writeReport(root, id, { phase, result, reason }) {
  const state = readState(root, id);
  let land = null;
  try {
    land = planFrame(state.plan).land;
  } catch {
  }
  const dir = runDir(root, id);
  const open = readGates(dir).filter((gate) => gate.status === 'open');
  const lines = [
    `# exo run ${id}`,
    `Phase: ${phase}`,
    ...(reason && ['refused', 'stopped', 'crashed'].includes(phase) ? [`Reason: ${reason.replace(/\s*\n\s*/g, ' ')}`] : []),
    `Land: ${land ?? 'none'}`,
    `Branch: ${state.branch ?? 'none'}`,
    `Landed: ${result?.range ?? 'none'}`,
    `Pushed: ${result?.prUrl ?? result?.pushed ?? 'none'}`,
    `Open gates: ${open.length}`,
    ...open.slice(0, 4).map((gate) => `- ${gate.source}: ${gate.action} (${gate.reason})`),
    `Decisions: ${readDecisions(dir).length}`,
    `Cleanup: ${result?.cleanup ?? 'none'}`
  ];
  const denied = path.join(dir, 'denied.txt');
  const refused = fs.existsSync(denied) ? fs.readFileSync(denied, 'utf8') : '';
  fs.writeFileSync(path.join(dir, 'report.md'), `${lines.slice(0, 15).join('\n')}\n${refused}`);
}

function teeToFile(file) {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => {
      fs.appendFileSync(file, chunk);
      return write(chunk, ...rest);
    };
  }
}

function notify(id, phase) {
  // why: a host without osascript makes spawnSync return an error, which is ignored.
  spawnSync('osascript', ['-e', `display notification "exo run ${id.replace(/[^\w.-]/g, '')}: ${phase}" with title "exo"`], { stdio: 'ignore' });
}

async function runCommand(argv, { approving = false } = {}) {
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

  const live = liveLogFile(root);
  if (!child) fs.appendFileSync(live, `=== ${new Date().toTimeString().slice(0, 8)} run ${id} ${path.basename(plan)} ===\n`);
  // why: only the detach spawn passes --run-id, without --detach, so the child is the detached run.
  if (child) teeToFile(live);

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
    process.stdout.write(`exo: run ${id} started in the background (pid ${started.pid}); exo status ${id}, log ${log}, live log ${live}; watch: run \`${watchCommand(id)}\` as one background Bash call\n`);
    return 0;
  }

  let code = 1;
  let phase = 'crashed';
  let result = null;
  let reason = null;
  try {
    if (readState(root, id).stage === 'landing') result = landStage(root, id, plan);
    else {
      const built = await buildRun(root, plan, flags, id);
      code = built.code ?? 1;
      phase = phaseForExit(code);
      reason = built.reason;
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
    reason = error.message;
    if (error instanceof Refusal) {
      phase = 'refused';
      code = 2;
    }
    throw error;
  } finally {
    updateRun(root, id, { phase, exitCode: code });
    releaseLock(root, id);
    try {
      writeReport(root, id, { phase, result, reason });
    } catch (error) {
      process.stderr.write(`exo: report.md not written: ${error.message}\n`);
    }
    notify(id, phase);
    if (['landed', 'passed', 'refused'].includes(phase)) keepRun(root, id);
  }
  return code;
}

async function approveCommand(args) {
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

function findRun(root, id) {
  try {
    const dir = keptDir(root, id);
    return { state: JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')), dir, kept: true };
  } catch {
    const state = readState(root, id);
    return state === null ? null : { state, dir: runDir(root, id), kept: false };
  }
}

async function waitCommand(args) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal('usage: exo wait <id>');
  const deadline = Date.now() + environmentMs('EXO_WAIT_MS', WAIT_MS);
  for (;;) {
    const found = findRun(root, id);
    if (found === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
    const { state, dir, kept } = found;
    const final = FINAL_PHASES.includes(state.phase);
    const alive = isAlive(state.pid);
    // why: a run writes its final phase before report.md and the move to .exo/kept/, so the wait ends once the run is kept or its process is gone.
    if (final && (kept || !alive)) {
      process.stdout.write(`exo: run ${id} ${state.phase}; report ${path.join(dir, 'report.md')}\n`);
      return ['passed', 'landed'].includes(state.phase) ? 0 : 1;
    }
    if (!final && !alive) {
      process.stdout.write(`exo: run ${id} ${state.phase}; process gone, continue with: exo run --resume ${id}\n`);
      return 1;
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      process.stdout.write(`exo: run ${id} still ${state.phase} at the wait deadline; keep waiting with: ${watchCommand(id)}\n`);
      // why: 124 is the exit code timeout(1) uses, so a deadline reads apart from a failed run.
      return 124;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_MS, left)));
  }
}

async function dispatch(command, rest) {
  if (command === 'setup') return setupCommand();
  if (command === 'run' && rest[0] === 'config') return configCommand(rest.slice(1));
  if (command === 'approve') {
    process.exitCode = await approveCommand(rest);
    return;
  }
  if (command === 'status') return statusCommand(rest);
  if (command === 'wait') {
    process.exitCode = await waitCommand(rest);
    return;
  }
  if (command === 'run') {
    process.exitCode = await runCommand(rest);
    return;
  }
  if (command === '--help') return process.stdout.write(`${USAGE}\n`);
  throw new Refusal(USAGE);
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    await dispatch(command, rest);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
