import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { CLI, watchCommand } from './cli-paths.mjs';
import { FINAL_PHASES, acquireLock, approveGates, createRun, isAlive, keepRun, liveLogFile, newRunId, pauseCleared, phaseForExit, readState, releaseLock, removeRun, runDir, unfinishedRun, updateRun } from './run-state.mjs';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';
import { newestPlan } from './plan-file.mjs';
import { refuseDirty } from './run-checkout.mjs';
import { buildRun, isPreview, landStage } from './run-stages.mjs';
import { writeReport } from './report-file.mjs';
import { notifyRun } from './notify.mjs';

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

async function closeRun(root, { id, plan }, outcome) {
  const { code, phase, result, reason } = outcome;
  updateRun(root, id, { phase, exitCode: code, ...(reason ? { reason: reason.replace(/\s*\n\s*/g, ' ') } : {}) });
  releaseLock(root, id);
  saveReport(root, id, { phase, result, reason });
  await notifyRun(root, { id, plan }, outcome);
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
  const root = checkoutRoot();
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
  const root = checkoutRoot();
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal('usage: exo approve <id>');
  const state = readState(root, id);
  if (state === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  if (state.phase !== 'parked') throw new Refusal(`refused: run ${id} is ${state.phase}, not parked`);
  return runCommand(['--resume', id], { approving: true });
}
