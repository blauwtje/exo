import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { isAlive } from '#land-lock';
import { CLI, RUN_PLAN, watchCommand } from './run-session-paths.mjs';
import { FINAL_PHASES, acquireLock, approveGates, createRun, keepRun, liveLogFile, newRunId, pauseCleared, phaseForExit, readState, releaseLock, removeRun, runDir, unfinishedRun, updateRun, readGates } from './run-state.mjs';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';
import { newestPlan, planFrame } from './plan-file.mjs';
import { refuseDirty, isPluginCheckout, putOnBranch, refuseLoadedCheckout, worktreeFor, worktrees } from './run-checkout.mjs';
import { defaultBranch, gitLine, gitResult, shortSha } from '#git';
import { recordRefDiff, recordWorktree, snapshotRefs } from './run-ops.mjs';
import { landRun } from './land-run.mjs';
import { readDecisions } from '#run-decision';

function runOptions(argv) {
  const rest = [];
  const options = { detach: false, resume: null, runId: null };
  const optionNames = { '--resume': 'resume', '--run-id': 'runId' };
  for (let i = 0; i < argv.length; i++) {
    const name = optionNames[argv[i]];
    if (argv[i] === '--detach') {
      options.detach = true;
      continue;
    }
    if (name === undefined) {
      rest.push(argv[i]);
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Refusal(`${argv[i - 1]} needs a run id`);
    options[name] = value;
  }
  return { ...options, rest };
}

function refuseParked(root, old, approving) {
  if (old.phase === 'parked' && !approving && !pauseCleared(root, old)) throw new Refusal(`refused: run ${old.id} is parked; use exo approve ${old.id}`);
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


function resumedRun(root, id, approving) {
  const old = readState(root, id);
  if (old === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  if (old.phase === 'passed') throw new Refusal(`refused: run ${id} already passed`);
  if (old.phase === 'landed') throw new Refusal(`refused: run ${id} already landed`);
  refuseParked(root, old, approving);
  if (isAlive(old.pid) && !FINAL_PHASES.includes(old.phase)) throw new Refusal(`refused: run ${id} is still running (pid ${old.pid})`);
  return { id, old, plan: old.plan, flags: old.flags, detach: old.detach };
}

function freshRun(root, options, approving) {
  const given = options.rest[0] !== undefined && !options.rest[0].startsWith('--');
  const flags = given ? options.rest.slice(1) : options.rest;
  const plan = given ? path.resolve(options.rest[0]) : newestPlan(root);
  if (plan === null) throw new Refusal('no plan under docs/specs/ or docs/plans/; pass one: exo run <plan>');
  if (!given && options.runId === null) process.stdout.write(`exo: plan ${plan}\n`);
  if (!fs.existsSync(plan)) throw new Refusal(`cannot read ${plan}: no such file`);
  const old = options.runId === null && !isPreview(flags) ? unfinishedRun(root, plan) : null;
  if (old === null) return { id: options.runId ?? newRunId(), old, plan, flags, detach: options.detach };
  refuseParked(root, old, approving);
  process.stdout.write(`exo: continuing run ${old.id}\n`);
  return { id: old.id, old, plan, flags, detach: options.detach };
}

function claimRun(root, { id, old, plan, flags, detach }) {
  const log = detach ? path.join(runDir(root, id), 'run.log') : null;
  const ownerSession = process.env.CLAUDE_CODE_SESSION_ID || undefined;
  if (old !== null) updateRun(root, id, { phase: 'starting', exitCode: null, pid: process.pid, log, plan, flags, detach, ...(ownerSession ? { ownerSession } : {}) });
  else createRun(root, { id, plan, flags, detach, log, ownerSession });
  const lock = acquireLock(root, id);
  if (lock.ok) {
    if (lock.stale) process.stdout.write(`exo: took over the lock of run ${lock.stale}, whose process is gone\n`);
    return;
  }
  if (old !== null) updateRun(root, id, { phase: old.phase, exitCode: old.exitCode, pid: old.pid, log: old.log, ownerSession: old.ownerSession });
  else removeRun(root, id);
  throw new Refusal(`refused: run ${lock.holder} is still running in this checkout; exo status shows it`);
}

function saveReport(root, id, fields) {
  try {
    writeReport(root, id, fields);
  } catch (error) {
    process.stderr.write(`exo: report.md not written: ${error.message}\n`);
  }
}

function detachRun(root, { id, plan, flags }, live) {
  const log = path.join(runDir(root, id), 'run.log');
  const fd = fs.openSync(log, 'a');
  const started = spawn(process.execPath, [CLI, 'run', plan, '--run-id', id, ...flags], { cwd: root, detached: true, stdio: ['ignore', fd, fd] });
  started.unref();
  fs.closeSync(fd);
  updateRun(root, id, { pid: started.pid });
  process.stdout.write(`exo: run ${id} started in the background (pid ${started.pid}); exo status ${id}, log ${log}, live log ${live}; watch: run \`${watchCommand(id)}\` as one background Bash call\n`);
  return 0;
}

function keepAwake() {
  if (process.platform !== 'darwin') return;
  const awake = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  awake.on('error', () => {});
  awake.unref();
}

async function buildStage({ root, run, child, outcome }) {
  const { id, plan, flags } = run;
  if (!child) refuseDirty(root);
  const built = await buildRun({ root, plan, flags, id });
  outcome.code = built.code ?? 1;
  outcome.phase = phaseForExit(outcome.code);
  outcome.reason = built.reason;
  updateRun(root, id, { runRoot: built.runRoot, branch: built.branch });
  if (outcome.code !== 0 || built.land === null) return;
  updateRun(root, id, { phase: 'landing', stage: 'landing' });
  outcome.result = landStage(root, id, plan);
}

async function execute({ root, run, child, outcome }) {
  if (readState(root, run.id).stage === 'landing') outcome.result = landStage(root, run.id, run.plan);
  else await buildStage({ root, run, child, outcome });
  if (outcome.result === null) return;
  outcome.phase = outcome.result.phase;
  outcome.code = outcome.phase === 'landed' ? 0 : 3;
}

export function desktopNotice(id, phase) {
  spawnSync('osascript', ['-e', `display notification "exo run ${id.replace(/[^\w.-]/g, '')}: ${phase}" with title "exo"`], { stdio: 'ignore' });
}

async function closeRun(root, { id }, outcome) {
  const { code, phase, result, reason } = outcome;
  updateRun(root, id, { phase, exitCode: code, ...(reason ? { reason: reason.replace(/\s*\n\s*/g, ' ') } : {}) });
  releaseLock(root, id);
  saveReport(root, id, { phase, result, reason });
  desktopNotice(id, phase);
  if (['landed', 'passed', 'refused'].includes(phase)) keepRun(root, id);
}

async function finishRun({ root, run, child }) {
  const outcome = { code: 1, phase: 'crashed', result: null, reason: null };
  try {
    await execute({ root, run, child, outcome });
  } catch (error) {
    outcome.reason = error.message;
    if (error instanceof Refusal) {
      outcome.phase = 'refused';
      outcome.code = 2;
    }
    throw error;
  } finally {
    await closeRun(root, run, outcome);
  }
  return outcome.code;
}

export async function runCommand(argv, { approving = false } = {}) {
  const root = checkoutRoot(process.cwd());
  const options = runOptions(argv);
  const run = options.resume !== null ? resumedRun(root, options.runId ?? options.resume, approving) : freshRun(root, options, approving);
  const { id, plan, detach } = run;
  const child = options.runId !== null;
  if (detach && !child) refuseDirty(root);
  if (!child) claimRun(root, run);

  const live = liveLogFile(root);
  if (child) teeToFile(live);
  else fs.appendFileSync(live, `=== ${new Date().toTimeString().slice(0, 8)} run ${id} ${path.basename(plan)} ===\n`);

  if (approving && !child) {
    const approved = approveGates(runDir(root, id));
    if (!detach) process.stdout.write(`exo: approved ${approved} gate(s) of run ${id}; continuing\n`);
  }
  if (!child) saveReport(root, id, { phase: 'starting', result: null, reason: null });
  if (detach && !child) return detachRun(root, run, live);

  keepAwake();
  return finishRun({ root, run, child });
}

export async function approveCommand(args) {
  const root = checkoutRoot(process.cwd());
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal(`usage: exo approve <id> (got: ${args.join(' ') || 'no arguments'})`);
  const state = readState(root, id);
  if (state === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  if (state.phase !== 'parked') throw new Refusal(`refused: run ${id} is ${state.phase}, not parked`);
  return runCommand(['--resume', id], { approving: true });
}

const isPreview = (flags) => flags.some((flag) => flag === '--dry-run' || flag === '--help');

async function buildRun({ root, plan, flags, id }) {
  const before = snapshotRefs(root);
  try {
    return await buildRunSteps({ root, plan, flags, id });
  } finally {
    if (!isPreview(flags)) recordRefDiff({ root, id, label: 'build' }, before);
  }
}

function checkoutRunRoot({ root, branch, id }) {
  const inTree = branch !== null && isPluginCheckout(root);
  if (inTree) {
    const runRoot = worktreeFor(root, branch);
    if (runRoot !== root) recordWorktree({ root, id, label: 'build' }, runRoot, branch);
    return { runRoot, inTree };
  }
  refuseLoadedCheckout(root, CLI);
  if (branch !== null) putOnBranch(root, branch);
  return { runRoot: root, inTree };
}

async function runPlanChild({ root, plan, flags, id }, { runRoot, inTree }) {
  const rootFlags = inTree ? ['--root', runRoot] : [];
  const env = { ...process.env, EXO_RUN: id, EXO_RUN_DIR: runDir(root, id) };
  const child = spawn(process.execPath, [RUN_PLAN, plan, ...rootFlags, ...flags], { cwd: runRoot, stdio: ['inherit', 'pipe', 'pipe'], env });
  let outTail = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    outTail = `${outTail}${chunk}`.slice(-4000);
  });
  const forward = (signal) => child.kill(signal);
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const signal of signals) process.on(signal, forward);
  const done = await new Promise((resolve) => {
    child.on('error', () => resolve({ status: null }));
    child.on('close', (status) => resolve({ status }));
  });
  for (const signal of signals) process.off(signal, forward);
  return { status: done.status ?? null, outTail };
}

function stopReason(outTail) {
  const reasonLine = outTail.split('\n').filter((line) => /^(exo|run-plan): /.test(line)).pop();
  return reasonLine === undefined ? null : reasonLine.replace(/^(exo|run-plan): (refused: )?/, '');
}

async function buildRunSteps(run) {
  const { root, plan, flags, id } = run;
  const { branch, land } = planFrame(plan);
  const base = defaultBranch(root);
  const chores = base !== null && !isPreview(flags);
  const missing = branch !== null && gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`]) === null;
  if (chores) updateDefault(root, base, missing);
  const checkout = checkoutRunRoot({ root, branch, id });
  if (chores) cleanUp(root, base, [branch, gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD'])]);
  const { status, outTail } = await runPlanChild(run, checkout);
  return { code: status, runRoot: checkout.runRoot, branch, land: isPreview(flags) ? null : land, reason: stopReason(outTail) };
}

function updateDefault(root, base, needed) {
  if (gitResult(root, ['remote']).text === '') return;
  if (!gitResult(root, ['fetch', '--prune']).ok) {
    process.stdout.write('exo: git fetch failed; going on with the local default branch\n');
    return;
  }
  const upstream = gitResult(root, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${base}`]).text;
  const local = gitResult(root, ['rev-parse', '-q', '--verify', `refs/heads/${base}`]).text;
  if (upstream === '' || local === '' || upstream === local) return;
  if (gitResult(root, ['merge-base', '--is-ancestor', upstream, local]).ok) return;
  if (!gitResult(root, ['merge-base', '--is-ancestor', local, upstream]).ok) {
    if (!needed) {
      process.stdout.write(`exo: warning: ${base} and origin/${base} have diverged; going on with the existing plan branch\n`);
      return;
    }
    throw new Refusal(`refused: ${base} and origin/${base} have diverged; rebase or reset ${base} onto origin/${base} yourself, then rerun exo run`);
  }
  const holder = worktrees(root).find((tree) => tree.branch === base);
  const moved = holder === undefined
    ? gitResult(root, ['update-ref', '-m', 'exo: fast-forward', `refs/heads/${base}`, upstream, local])
    : gitResult(holder.path, ['merge', '--ff-only', upstream]);
  if (!moved.ok) throw new Refusal(`refused: could not fast-forward ${base} to origin/${base}: ${moved.error}`);
  process.stdout.write(`exo: fast-forwarded ${base} to origin/${base}\n`);
}

function cleanUp(root, base, keep) {
  gitResult(root, ['worktree', 'prune']);
  const merged = gitResult(root, ['branch', '--merged', base, '--format=%(refname:short)']).text.split('\n').filter(Boolean);
  const gone = gitResult(root, ['for-each-ref', '--format=%(refname:short)\t%(upstream:track)', 'refs/heads']).text
    .split('\n').filter((line) => line.endsWith('\t[gone]')).map((line) => line.split('\t')[0]);
  const checkedOut = worktrees(root).map((tree) => tree.branch);
  for (const name of merged) {
    if (name === base || keep.includes(name) || !gone.includes(name) || checkedOut.includes(name)) continue;
    const deleted = gitResult(root, ['branch', '-d', name]);
    process.stdout.write(deleted.ok ? `exo: removed branch ${name}\n` : `exo: kept branch ${name}: ${deleted.error}\n`);
  }
}

function landStage(root, id, plan) {
  const state = readState(root, id);
  const frame = planFrame(plan);
  const result = landRun({
    root, runRoot: state.runRoot ?? root, branch: state.branch ?? frame.branch, mode: frame.land, commit: frame.commit ?? '', runDir: runDir(root, id),
    success: frame.successCriterion ?? ''
  });
  process.stdout.write(`exo: ${result.phase === 'landed' ? `landed ${result.range ?? ''} ${result.prUrl ?? ''}`.trim() : `parked: ${result.gate}; exo approve ${id}`}\n`);
  return result;
}

function branchRange(root, state) {
  const base = defaultBranch(root);
  if (!state.branch || base === null) return null;
  const head = gitLine(state.runRoot ?? root, ['rev-parse', '-q', '--verify', `refs/heads/${state.branch}`]);
  const fork = head === null ? null : gitLine(state.runRoot ?? root, ['merge-base', base, head]);
  if (fork === null || fork === head) return null;
  return `${shortSha(fork)}..${shortSha(head)}`;
}

function writeReport(root, id, { phase, result, reason }) {
  const state = readState(root, id);
  const range = result?.range ?? (['stopped', 'crashed', 'parked'].includes(phase) ? branchRange(root, state) : null);
  let land = null;
  try {
    land = planFrame(state.plan).land;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
  }
  const dir = runDir(root, id);
  const open = readGates(dir).filter((gate) => gate.status === 'open');
  const lines = [
    `# exo run ${id}`,
    `Phase: ${phase}`,
    ...(reason && ['refused', 'stopped', 'crashed'].includes(phase) ? [`Reason: ${reason.replace(/\s*\n\s*/g, ' ')}`] : []),
    `Land: ${land ?? 'none'}`,
    `Branch: ${state.branch ?? 'none'}`,
    `Landed: ${range ?? 'none'}`,
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
