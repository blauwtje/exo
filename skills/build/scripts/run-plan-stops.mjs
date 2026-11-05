import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { driftOf, isInputDrift, isUnreachableInput } from '#plan-inputs';
import { frameOf } from '#plan-frame';
import { SCRATCH_FOLDER } from '#scratch-path';
import { clip } from './run-report.mjs';
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

export function parkedStop(line, log) {
  return { line: `parked: ${line}`, why: `The run is parked: ${clip(line, 100)}`, next: `run exo approve for the open gate (see ${log}), then run exo run again`, parked: true };
}

export function unsafeStop(ctx, n, before, trailer, parsed, log) {
  const { root, say, branch, iteration } = ctx;
  const breach = planBreach(ctx) ?? breachOf(root, before, { trailer });
  if (breach !== null) {
    say(`task ${n} stopped: ${breach}`);
    return { line: `breach in iteration ${iteration}: ${breach}`, why: `A session broke a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, undo what is wrong, then run exo run again`, breach: true };
  }
  const parked = takeParked(n);
  if (parked !== null) {
    say(`task ${n} parked: ${clip(parked, 80)}`);
    return parkedStop(parked, log);
  }
  const notLoaded = exoError(parsed.init, PLUGIN_ROOT);
  if (notLoaded === null) return null;
  say(`task ${n} stopped: exo not loaded`);
  return { line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again' };
}

export function blockedStop(ctx, n, reason) {
  ctx.say(`task ${n} blocked: ${clip(reason, 80)}`);
  const next = isUnreachableInput(reason) ? 'make that input readable on this machine or drop it from the plan, then run exo run again' : 'repair per exo:spec references/watching.md, then run exo run again';
  return { line: `task ${n} blocked: ${reason}`, why: `Task ${n} is blocked: ${clip(reason, 100)}`, next };
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
