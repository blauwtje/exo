import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { orWhenAbsent } from '#absent-path';
import { parseLine } from '#basics';
import { isAlive } from '#land-lock';
import { pollUntil } from '../../../lib/loop-budget.mjs';
import { CLI, watchCommand } from './run-session-paths.mjs';
import { FINAL_PHASES, keptDir, listRuns, readGates, readState, runDir } from './run-state.mjs';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';

const WAIT_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1000;
const WATCHING = path.join(path.dirname(CLI), '..', '..', 'spec', 'references', 'watching.md');
const WAITING_PHASES = ['stopped', 'crashed', 'parked', 'refused'];

function phaseText(state) {
  return WAITING_PHASES.includes(state.phase) && state.updatedAt ? `${state.phase}, waiting since ${state.updatedAt}` : state.phase;
}

export function statusCommand(args) {
  const root = checkoutRoot(process.cwd());
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
  const dir = keptDir(root, id);
  const kept = orWhenAbsent(() => parseLine(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')), null);
  if (kept !== null) return { state: kept, dir, kept: true };
  const state = readState(root, id);
  return state === null ? null : { state, dir: runDir(root, id), kept: false };
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

function requireRun(root, id) {
  const found = findRun(root, id);
  if (found === null) throw new Refusal(`refused: no run ${id} in ${root}; exo status lists the runs`);
  return found;
}

function runSettled(root, id) {
  const { state, kept } = requireRun(root, id);
  const final = FINAL_PHASES.includes(state.phase);
  const alive = isAlive(state.pid);
  return final ? kept || !alive : !alive;
}

function settledExit(root, id) {
  const { state, dir } = requireRun(root, id);
  if (FINAL_PHASES.includes(state.phase)) return finishWait(state, id, dir);
  process.stdout.write(`exo: run ${id} ${state.phase}; process gone, continue with: exo run --resume ${id}\n`);
  return 1;
}

export async function waitCommand(args) {
  const root = checkoutRoot(process.cwd());
  const id = args[0];
  if (id === undefined || args.length !== 1) throw new Refusal(`usage: exo wait <id> (got: ${args.join(' ') || 'no arguments'})`);
  const settled = await pollUntil(() => runSettled(root, id), { intervalMs: POLL_MS, wallMs: environmentMs('EXO_WAIT_MS', WAIT_MS) });
  if (settled) return settledExit(root, id);
  const { state } = findRun(root, id);
  process.stdout.write(`exo: run ${id} still ${state.phase} at the wait deadline; keep waiting with: ${watchCommand(id)}\n`);
  return 124;
}
