import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { sleep } from '#basics';
import { CLI, watchCommand } from './cli-paths.mjs';
import { FINAL_PHASES, isAlive, keptDir, listRuns, readGates, readState, runDir } from './run-state.mjs';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';

// why: a plan run with several tasks and 30-minute gates can take hours; the deadline only ends a wait nobody reads.
const WAIT_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1000;
// why: a stopped or crashed run needs the repair cap and carry rules, which live in spec's watching reference.
const WATCHING = path.join(path.dirname(CLI), '..', '..', 'spec', 'references', 'watching.md');
const WAITING_PHASES = ['stopped', 'crashed', 'parked', 'refused'];

function phaseText(state) {
  return WAITING_PHASES.includes(state.phase) && state.updatedAt ? `${state.phase}, waiting since ${state.updatedAt}` : state.phase;
}

export function statusCommand(args) {
  const root = checkoutRoot();
  const runs = args[0] === undefined ? listRuns(root) : [readState(root, args[0])].filter(Boolean);
  if (runs.length === 0) throw new Refusal(args[0] === undefined ? 'no runs in this checkout' : `no run ${args[0]} in this checkout`);
  for (const run of runs) {
    const gone = !FINAL_PHASES.includes(run.phase) && !isAlive(run.pid);
    const note = run.phase === 'parked' ? `; exo approve ${run.id}` : gone ? `; process gone, continue with: exo run --resume ${run.id}` : '';
    process.stdout.write(`${run.id}  ${phaseText(run)}  ${path.basename(run.plan)}  pid ${run.pid}${run.log ? `  log ${run.log}` : ''}${note}\n`);
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

function finishWait(state, id, dir) {
  const report = path.join(dir, 'report.md');
  process.stdout.write(`exo: run ${id} ${phaseText(state)}; report ${report}\n`);
  if (['passed', 'landed'].includes(state.phase)) return 0;
  const next = {
    refused: `fix the cause, then rerun node "${CLI}" run "${state.plan}" --detach`,
    parked: `read ${report}, then node "${CLI}" approve ${id}`
  }[state.phase] ?? `read ${report}, one worktree agent repairs per ${WATCHING} (the lead edits no file), then node "${CLI}" run --resume ${id} --detach`;
  process.stdout.write(`${state.reason ? `Reason: ${state.reason}\n` : ''}Next: ${next}\n`);
  return 1;
}

export async function waitCommand(args) {
  const root = checkoutRoot();
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
      return finishWait(state, id, dir);
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
    await sleep(Math.min(POLL_MS, left));
  }
}
