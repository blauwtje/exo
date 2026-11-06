import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCRATCH_FOLDER } from '#scratch-path';
import { money } from './run-report.mjs';
import { appendLog, spawnClaude } from './run-session.mjs';
import { childEnv } from './run-session-env.mjs';
import { claudeArgs } from './run-session-args.mjs';
import { denyRules } from './run-session-rules.mjs';
import { exoError, parseStream } from './run-session-stream.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { PLUGIN_ROOT } from './run-session-paths.mjs';
import { snapshot } from './run-worktree.mjs';
import { appTail, ensureApp } from './run-plan-app.mjs';
import { noteCounts } from './run-plan-notes.mjs';

const BUILD_KINDS = ['task', 'plan'];

export function planHash(ctx) {
  return isFileOnDisk(ctx.planPath) ? createHash('sha256').update(fs.readFileSync(ctx.planPath)).digest('hex') : 'missing';
}

export function planBreach(ctx) {
  return planHash(ctx) === ctx.planAtStart ? null : 'plan changed';
}

const SOFT_SHARE = 0.8;

function noteSpend(ctx, entry) {
  (ctx.spendLog ??= []).push(entry);
  const { runCap, spent } = ctx;
  if (runCap === undefined || ctx.softNoted || spent < runCap * SOFT_SHARE || spent >= runCap) return;
  ctx.softNoted = true;
  ctx.say(`budget: ${money(spent)} of ${money(runCap)} spent, the run stops after the task that reaches the ceiling`);
}

export function handoffFile(ctx, number) {
  return path.join(ctx.root, SCRATCH_FOLDER, `handoff-task-${number}.md`);
}

export function handoffNote(ctx, number) {
  if (!isFileOnDisk(handoffFile(ctx, number))) return '';
  return `\nA previous session ran out of context and left a hand-off: read ${handoffFile(ctx, number)} first, then continue task ${number} from it.`;
}

function stallGuardOn(ctx, kind) {
  return ctx.sandbox.enabled && BUILD_KINDS.includes(kind);
}

function costBeyondEarlierTry(ctx, reported, resume) {
  const earlierCost = resume === null ? 0 : ctx.sessionCosts.get(resume) ?? 0;
  return Math.max(0, reported.cost - earlierCost);
}

function remainingBudget(ctx) {
  const { sessionCap, runCap } = ctx;
  return [sessionCap, runCap === undefined ? undefined : Number((runCap - ctx.spent).toFixed(6))].filter((value) => value !== undefined).reduce((low, value) => Math.min(low, value), Infinity);
}

export async function spawnOne(ctx, { prompt, allow, settings, pin, log, kind = 'task', task = null, sessionModel = ctx.model, sessionEffort = ctx.effort, resume = null, taskCount = 1, repair = false, limitMs = ctx.timeoutMs }) {
  const { root, provider, claude, pluginDir, ecosystemEnv, planPath } = ctx;
  if (BUILD_KINDS.includes(kind) && !(await ensureApp(ctx))) ctx.say(`app not ready, app log ends: ${appTail(ctx)}`);
  const before = snapshot(root);
  const budget = remainingBudget(ctx);
  ctx.liveSessions += 1;
  let outcome;
  try {
    outcome = await spawnClaude(claude, claudeArgs({ model: sessionModel, effort: sessionEffort, budget: Number.isFinite(budget) ? String(budget) : undefined, allow, settings, kind: BUILD_KINDS.includes(kind) ? 'build' : kind, pluginDir, stallGuard: stallGuardOn(ctx, kind), resume, taskCount, deny: BUILD_KINDS.includes(kind) ? denyRules({ planPath, repair }) : undefined }), {
      cwd: root, env: childEnv(pin, provider, { handoff: kind === 'task' && task !== null ? handoffFile(ctx, task) : null, ecosystemEnv, repair, refuseCommits: BUILD_KINDS.includes(kind) ? root : null }), prompt, log, timeoutMs: limitMs, refuseInit: (init) => exoError(init, PLUGIN_ROOT)
    });
  } finally {
    ctx.liveSessions -= 1;
  }
  if (!repair) ctx.sessionFallback = outcome.fallback ?? null;
  if (outcome.fallback) ctx.say(`${task === null ? kind : `task ${task}`} model ${outcome.fallback.from} -> ${outcome.fallback.to}: provider overloaded`);
  const reported = parseStream(outcome.text);
  const parsed = { ...reported, cost: costBeyondEarlierTry(ctx, reported, resume) };
  if (reported.sessionId) ctx.sessionCosts.set(reported.sessionId, reported.cost);
  ctx.spent += parsed.cost;
  noteCounts({ spent: Number(ctx.spent.toFixed(6)) });
  noteSpend(ctx, { kind: repair ? 'repair' : kind, task, cost: parsed.cost, known: reported.costKnown });
  appendLog(ctx.ledgerFile, `${JSON.stringify({ kind, task, sessionId: parsed.sessionId, costUsd: parsed.cost, hooks: parsed.hooks, cacheRead: parsed.cacheRead, cacheWrite: parsed.cacheWrite, firstCacheWrite: parsed.firstCacheWrite, model: parsed.model ?? sessionModel })}\n`);
  return { before, outcome, parsed: { ...parsed, model: parsed.model ?? sessionModel } };
}
