import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { CLI, watchCommand } from './cli-paths.mjs';
import { FINAL_PHASES, acquireLock, approveGates, createRun, isAlive, keepRun, liveLogFile, newRunId, pauseCleared, phaseForExit, readState, releaseLock, removeRun, runDir, unfinishedRun, updateRun } from './run-state.mjs';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';
import { buildRun } from './run-child.mjs';
import { landStage } from './run-land-stage.mjs';
import { newestPlan } from './plan-file.mjs';
import { refuseDirty } from './run-checkout.mjs';
import { writeReport } from './report-file.mjs';
import { notifyRun } from './notify.mjs';

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

export async function runCommand(argv, { approving = false } = {}) {
  const root = checkoutRoot();
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
    refuseParked(root, old, approving);
    if (isAlive(old.pid) && !FINAL_PHASES.includes(old.phase)) throw new Refusal(`refused: run ${id} is still running (pid ${old.pid})`);
    ({ plan, flags, detach } = old);
  } else {
    const given = options.rest[0] !== undefined && !options.rest[0].startsWith('--');
    flags = given ? options.rest.slice(1) : options.rest;
    plan = given ? path.resolve(options.rest[0]) : newestPlan(root);
    if (plan === null) throw new Refusal('no plan under docs/specs/ or docs/plans/; pass one: exo run <plan>');
    if (!given && options.runId === null) process.stdout.write(`exo: plan ${plan}\n`);
    if (!fs.existsSync(plan)) throw new Refusal(`cannot read ${plan}: no such file`);
    if (options.runId === null && !flags.some((flag) => flag === '--dry-run' || flag === '--help')) old = unfinishedRun(root, plan);
    if (old !== null) {
      id = old.id;
      refuseParked(root, old, approving);
      process.stdout.write(`exo: continuing run ${id}\n`);
    }
  }

  const child = options.runId !== null;
  if (detach && !child) refuseDirty(root);
  if (!child) {
    const log = detach ? path.join(runDir(root, id), 'run.log') : null;
    const ownerSession = process.env.CLAUDE_CODE_SESSION_ID || undefined;
    if (old !== null) updateRun(root, id, { phase: 'starting', exitCode: null, pid: process.pid, log, plan, flags, detach, ...(ownerSession ? { ownerSession } : {}) });
    else createRun(root, { id, plan, flags, detach, log, ownerSession });
    const lock = acquireLock(root, id);
    if (!lock.ok) {
      if (old !== null) updateRun(root, id, { phase: old.phase, exitCode: old.exitCode, pid: old.pid, log: old.log, ownerSession: old.ownerSession });
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

  if (!child) {
    try {
      writeReport(root, id, { phase: 'starting', result: null, reason: null });
    } catch (error) {
      process.stderr.write(`exo: report.md not written: ${error.message}\n`);
    }
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

  if (process.platform === 'darwin') {
    // why: caffeinate exits with this process, so the Mac stays awake through run-plan and the land step.
    const awake = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    awake.on('error', () => {});
    awake.unref();
  }

  let code = 1;
  let phase = 'crashed';
  let result = null;
  let reason = null;
  try {
    if (readState(root, id).stage === 'landing') result = landStage(root, id, plan);
    else {
      if (!child) refuseDirty(root);
      const built = await buildRun(root, plan, flags, id);
      code = built.code ?? 1;
      phase = phaseForExit(code);
      reason = built.reason;
      updateRun(root, id, { runRoot: built.runRoot, branch: built.branch });
      if (code === 0 && built.land !== null) {
        updateRun(root, id, { phase: 'landing', stage: 'landing' });
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
    updateRun(root, id, { phase, exitCode: code, ...(reason ? { reason: reason.replace(/\s*\n\s*/g, ' ') } : {}) });
    releaseLock(root, id);
    try {
      writeReport(root, id, { phase, result, reason });
    } catch (error) {
      process.stderr.write(`exo: report.md not written: ${error.message}\n`);
    }
    await notifyRun(root, { id, plan }, phase, reason);
    if (['landed', 'passed', 'refused'].includes(phase)) keepRun(root, id);
  }
  return code;
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
