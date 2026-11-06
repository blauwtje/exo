import { landedTasks } from '#plan-landed';
import { resumePoint } from './run-state.mjs';
import { journalSteps, noteStep, savedSpend } from './run-plan-notes.mjs';
import { snapshot } from './run-worktree.mjs';
import { parseStream } from './run-session-stream.mjs';

export function restoreResume(ctx, failedSessions, unprovenRetried) {
  ctx.spent = savedSpend();
  const point = resumePoint(journalSteps());
  const landed = landedTasks(ctx.plan.tasks, ctx.root, ctx.planId);
  const attempt = [...point.attempts.values()].filter((step) => !landed.includes(step.task)).at(-1);
  ctx.resumed = { pending: point.pending !== null && !point.pending.timedOut && point.pending.plan === ctx.planAtStart && !landed.includes(point.pending.task) ? point.pending : null };
  if (attempt === undefined) return;
  ctx.failedAttempts = point.failedAttempts;
  for (const step of point.attempts.values()) {
    if (landed.includes(step.task)) continue;
    ctx.fingerprints.set(step.task, new Set(step.fingerprints));
    if (step.sessionId) failedSessions.set(step.task, step.sessionId);
    if (step.freeTried) unprovenRetried.add(step.task);
  }
  ctx.retryNote = attempt.retryNote;
}

export function takePending(ctx, n) {
  const step = ctx.resumed?.pending;
  if (step?.task !== n) return null;
  ctx.resumed.pending = null;
  return step;
}

export function replayedSession(ctx, step) {
  ctx.sessionFallback = null;
  const parsed = { ...parseStream(''), resultText: step.last, sessionId: step.sessionId ?? null, model: step.model };
  return { before: snapshot(ctx.root), outcome: { timedOut: false, code: 0, signal: null }, parsed };
}

export function noteSession(ctx, n, { outcome, parsed, last, marker }) {
  noteStep({ kind: 'session', task: n, sessionId: parsed.sessionId ?? null, model: parsed.model, cost: parsed.cost, last, marker, timedOut: outcome.timedOut === true, plan: ctx.planAtStart });
}

export function noteAttempt(ctx, n, { sessionId, retryNote, freeTried }) {
  noteStep({ kind: 'attempt', task: n, sessionId: sessionId ?? null, retryNote, freeTried, failedAttempts: ctx.failedAttempts, fingerprints: [...(ctx.fingerprints.get(n) ?? [])] });
}
