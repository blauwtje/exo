import { cacheFields } from './run-cache-tokens.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { failingLine } from '#attempt-fingerprint';
import { clip } from './run-report.mjs';
import { exoError } from './run-session-stream.mjs';
import { PLUGIN_ROOT, SCRIPT } from './run-session-paths.mjs';
import { breachOf } from './run-worktree.mjs';
import { lastLine } from './run-plan-preflight.mjs';
import { planBreach, spawnOne } from './run-plan-session.mjs';
import { budgetStop, parkedStop, takeParked } from './run-plan-stops.mjs';

export async function runTailSession(ctx, { kind, task = null, model: asked = null, prompt }) {
  const { run, root, branch, provider, model, tailAllow, tailSettings, timeoutMs, logDir } = ctx;
  const budget = budgetStop(ctx);
  if (budget !== null) return { stop: { ...budget, gate: 'FAIL' } };
  ctx.tailSessions += 1;
  ctx.iteration += 1;
  const number = ctx.iteration;
  const log = path.join(logDir, `tail-${ctx.tailSessions}-${kind}.log`);
  const sessionModel = asked !== null && provider.name === 'claude' ? asked : model;
  const { before, outcome, parsed } = await spawnOne(ctx, { prompt, allow: tailAllow, settings: tailSettings, pin: null, log, kind, task, sessionModel, limitMs: timeoutMs });
  const last = outcome.timedOut ? 'timed out' : lastLine(parsed.resultText);
  run.records.push({ iteration: number, task: null, kind, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, ...cacheFields(parsed), last, denied: [], refused: [] });
  const breach = planBreach(ctx) ?? breachOf(root, before, { tail: true });
  const parked = breach === null ? takeParked('tail') : null;
  const notLoaded = breach === null && parked === null ? exoError(parsed.init, PLUGIN_ROOT) : null;
  if (breach !== null) return { stop: { kind: 'breach', line: `breach in iteration ${number}: ${breach}`, why: `The final review or fix session breached a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, then run exo run again`, gate: 'FAIL' } };
  if (parked !== null) return { stop: { ...parkedStop(parked, log), gate: 'FAIL' } };
  if (notLoaded !== null) return { stop: { kind: 'setup', line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again', gate: 'FAIL' } };
  return { resultText: outcome.timedOut ? '' : parsed.resultText, model: parsed.model, sessionId: parsed.sessionId, timedOut: Boolean(outcome.timedOut) };
}

export function landRepair(ctx) {
  const { root, plan, planPath, say } = ctx;
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0 || status.stdout.trim() === '') return null;
  const scope = plan.tasks[0]?.title.match(/^\w+\(([^)]+)\)/)?.[1];
  const landed = spawnSync(process.execPath, [SCRIPT.landTask, '--fix', `fix${scope === undefined ? '' : `(${scope})`}: repair the Success criterion`, '--plan', planPath, '--root', root], { cwd: root, encoding: 'utf8' });
  if (landed.status === 0) {
    say('repair landed');
    return null;
  }
  const last = failingLine(`${landed.stdout ?? ''}${landed.stderr ?? ''}`);
  return { kind: 'gate', line: `repair landing failed: ${last}`, why: `Landing the Success criterion repair failed (${clip(last, 80)})`, next: 'repair on the branch, then run exo run again', gate: 'FAIL' };
}
