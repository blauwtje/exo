import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { driftOf, isInputDrift, isUnreachableInput } from '#plan-inputs';
import { frameOf } from '#plan-frame';
import { SCRATCH_FOLDER } from '#scratch-path';
import { clip, money, taskSubject } from './run-report.mjs';
import { openGate, phaseForExit, readGates, takeApproved } from './run-state.mjs';
import { noteStop } from './run-plan-notes.mjs';
import { agentMaxTurns } from './run-session-args.mjs';
import { exoError } from './run-session-stream.mjs';
import { PLUGIN_ROOT } from './run-session-paths.mjs';
import { breachOf, shelveLeftover } from './run-worktree.mjs';
import { planBreach } from './run-plan-session.mjs';

export function takeParked(name) {
  const file = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'parked') : null;
  if (file === null || !fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').trim();
  if (!line.startsWith(`Task ${name}: PARKED`)) return null;
  fs.rmSync(file, { force: true });
  return line.replace(/^Task \S+: PARKED\s*/, '');
}

export const CEILING_EXIT = 4;

const STOP_KINDS = {
  done: { resumable: false },
  ceiling: { exit: CEILING_EXIT, resumable: true },
  autonomy: { exit: 3, resumable: true },
  parked: { exit: 3, resumable: true },
  breach: { resumable: true },
  blocked: { resumable: true },
  stalled: { resumable: true },
  capped: { resumable: true },
  setup: { resumable: true },
  gate: { resumable: true },
  signal: { resumable: true }
};

export function stopOf(kind, fields) {
  return { kind, ...fields };
}

export function recordRunStop(ctx, stop, exitCode) {
  const reason = stop?.line ?? 'final check failed';
  const task = stop?.task ?? ctx.currentTask ?? null;
  const record = { kind: stop?.kind ?? 'gate', reason, task, resumable: STOP_KINDS[stop?.kind ?? 'gate'].resumable };
  noteStop(exitCode === 0 ? { reason, stop: record } : { phase: phaseForExit(exitCode), reason, stop: record });
  ctx.say(exitCode === 0 ? 'run done' : `run stopped: ${stop?.why ?? 'final check failed'}`);
}

export function stopRun(ctx, stop, planned = 1) {
  const exitCode = STOP_KINDS[stop?.kind]?.exit ?? planned;
  recordRunStop(ctx, stop, exitCode);
  return exitCode;
}

export function budgetStop(ctx, task) {
  const { runCap, spent } = ctx;
  if (runCap === undefined || spent < runCap) return null;
  return stopOf('ceiling', { task, line: `budget: ${money(spent)} of ${money(runCap)}`, why: `The run spent its budget of ${money(runCap)}`, next: 'raise --max-run-usd or defaults.maxRunUsd in run.json, then run exo run again' });
}

export function parkedStop(line, log, kind = 'parked', task) {
  return stopOf(kind, { task, line: `parked: ${line}`, why: `The run is parked: ${clip(line, 100)}`, next: `run exo approve for the open gate (see ${log}), then run exo run again` });
}

export function unsafeStop(ctx, n, before, trailer, parsed, log) {
  const { root, say, branch, iteration } = ctx;
  const breach = planBreach(ctx) ?? breachOf(root, before, { trailer });
  if (breach !== null) {
    say(`task ${n} stopped: ${breach}`);
    return { kind: 'breach', task: n, line: `breach in iteration ${iteration}: ${breach}`, why: `A session broke a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, undo what is wrong, then run exo run again`, breach: true };
  }
  const parked = takeParked(n);
  if (parked !== null) {
    say(`task ${n} parked: ${clip(parked, 80)}`);
    return parkedStop(parked, log, 'parked', n);
  }
  const notLoaded = exoError(parsed.init, PLUGIN_ROOT);
  if (notLoaded === null) return null;
  say(`task ${n} stopped: exo not loaded`);
  return { kind: 'setup', task: n, line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again' };
}

export function blockedStop(ctx, n, reason) {
  ctx.say(`task ${n} blocked: ${clip(reason, 80)}`);
  const next = isUnreachableInput(reason) ? 'make that input readable on this machine or drop it from the plan, then run exo run again' : 'repair per exo:spec references/watching.md, then run exo run again';
  return { kind: 'blocked', task: n, line: `task ${n} blocked: ${reason}`, why: `Task ${n} is blocked: ${clip(reason, 100)}`, next };
}

export function pausesBefore(plan, task) {
  const { autonomy } = frameOf(plan.frame);
  return autonomy === 'approve-each' || (autonomy === 'pause-flagged' && task.pause === 'yes');
}

export function autonomyStop(ctx, task) {
  const dir = process.env.EXO_RUN_DIR;
  if (!dir || !pausesBefore(ctx.plan, task)) return undefined;
  const action = `start task ${task.number} ${taskSubject(task.title).replace(/[()\n]/g, ' ').trim()}`;
  const used = readGates(dir).some((gate) => gate.status === 'used' && gate.source === 'autonomy' && gate.action === action);
  if (used || takeApproved(dir, action)) return undefined;
  openGate(dir, { source: 'autonomy', action, reason: `the plan's Autonomy pauses before task ${task.number}` });
  ctx.say(`task ${task.number} paused for approval`);
  return parkedStop(`paused before task ${task.number} for approval`, path.join(ctx.logDir, 'progress.md'), 'autonomy', task.number);
}

export function unreachableInputStop(ctx, n) {
  const items = driftOf(ctx.plan.tasks.find((entry) => entry.number === n), ctx.root, frameOf(ctx.plan.frame)).filter(isInputDrift);
  return items.length === 0 ? undefined : blockedStop(ctx, n, `PLAN DRIFT ${items.join('; ')}`);
}

export function shelvePartialWork(ctx, n) {
  const { root, say } = ctx;
  const carry = path.join(root, SCRATCH_FOLDER, 'carry');
  fs.mkdirSync(carry, { recursive: true });
  const { patch, failed } = shelveLeftover(root, path.join(carry, `task${n}-partial.patch`), ctx.untrackedAtStart);
  if (patch !== null) say(`task ${n} partial work saved to ${patch}`);
  if (failed !== undefined) say(`task ${n} partial work not cleared: ${clip(failed, 80)}`);
}

export function maxTurnsStop(ctx, n, outcome, parsed, taskCount) {
  if (outcome.timedOut || parsed.subtype !== 'error_max_turns') return undefined;
  shelvePartialWork(ctx, n);
  return blockedStop(ctx, n, `hit --max-turns ${agentMaxTurns('build') * taskCount}`);
}
