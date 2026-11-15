import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cacheFields } from './run-cache-tokens.mjs';
import { failingLine } from '#attempt-fingerprint';
import { landedTasks, planTaskTrailer } from '#plan-landed';
import { readyTasks } from '#plan-waves';
import { SCRATCH_FOLDER } from '#scratch-path';
import { agentMaxTurns } from './run-session-args.mjs';
import { deniedFields } from './run-session-stream.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { shelveLeftover, untrackedPaths } from './run-worktree.mjs';
import { planPrompt } from './run-prompts.mjs';
import { clip, numbersText, startLine, taskSubject } from './run-report.mjs';
import { hasPin, isDocTask } from './run-plan-provider.mjs';
import { sessionLast } from './run-plan-preflight.mjs';
import { noteTask, noteStep } from './run-plan-notes.mjs';
import { noteAttempt, noteSession, replayedSession, restoreResume, takePending } from './run-plan-resume.mjs';
import { proofNotRun, recordAttempt, settleAttempt, writeReplyReport } from './run-plan-attempts.mjs';
import { rebaseOntoMovedBase } from './run-plan-rebase.mjs';
import { handoffFile, handoffNote, spawnOne } from './run-plan-session.mjs';
import { autonomyStop, blockedStop, budgetStop, maxTurnsStop, shelvePartialWork, unreachableInputStop, unsafeStop } from './run-plan-stops.mjs';
import { failedAttemptNote, landByScript, landedByChangelogScript, landInOrder, markLanded, markNow, notePlanSession, sayIdle } from './run-plan-landing.mjs';
import { repairTask, repairedNote } from './run-plan-repair.mjs';

const fixNext = (log) => `read ${log}, fix the cause, then run exo run again`;

export async function buildTasks(ctx, setup) {
  const build = { ctx, setup, failedSessions: new Map(), unprovenRetried: new Set(), lastTask: null };
  restoreResume(ctx, build.failedSessions, build.unprovenRetried);
  let stop = setup.chosen.mode === 'plan' && setup.order.length > 0 ? await runPlanSession(build) : undefined;
  while (stop === undefined) {
    const landed = landedTasks(ctx.plan.tasks, ctx.root, ctx.planId);
    if (landed.length === ctx.plan.tasks.length) break;
    stop = await buildNextTask(build, landed);
  }
  return { stop, lastTask: build.lastTask };
}

function recordSession(build, { task, log, parsed, last }) {
  const record = { iteration: build.ctx.iteration, task, log, turns: parsed.turns, weightedTokens: parsed.weightedTokens, cost: parsed.cost, peakContext: parsed.peakContext, ...cacheFields(parsed), last, ...deniedFields(parsed) };
  build.ctx.run.records.push(record);
  build.lastTask = task;
  return record;
}

async function runPlanSession(build) {
  const { ctx, setup: { order, taskAllow } } = build;
  const first = order[0];
  const early = budgetStop(ctx, first) ?? unreachableInputStop(ctx, first);
  if (early !== undefined) return early;
  ctx.iteration += 1;
  const startedPlan = markNow();
  const untrackedBefore = new Set(untrackedPaths(ctx.root));
  ctx.say(`plan session start: tasks ${numbersText(order)}`);
  const log = path.join(ctx.logDir, `iter-${ctx.iteration}-plan.log`);
  const prompt = planPrompt({ plan: ctx.plan, planPath: ctx.planPath, numbers: order, root: ctx.root, sandbox: ctx.provider.sandbox.enabled });
  const { before, outcome, parsed } = await spawnOne(ctx, { prompt, allow: taskAllow, settings: ctx.taskSettings, pin: `${ctx.planId}/${first}`, log, kind: 'plan', task: first, taskCount: order.length });
  sayIdle(ctx, startedPlan);
  const last = sessionLast(outcome, parsed, ctx.timeoutMs);
  const record = recordSession(build, { task: first, log, parsed, last });
  if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
  const stop = planSessionStop(ctx, { first, before, outcome, parsed, last, log, taskCount: order.length });
  landInOrder({ ctx, numbers: stop === undefined ? order : [], record, started: null });
  notePlanSession(ctx, record, startedPlan);
  if (stop !== undefined) return stop;
  if (landedTasks(ctx.plan.tasks, ctx.root, ctx.planId).length >= ctx.plan.tasks.length) return undefined;
  return planLeftoverStop(build, untrackedBefore);
}

function planSessionStop(ctx, { first, before, outcome, parsed, last, log, taskCount }) {
  const unsafe = unsafeStop({ ctx, n: first, before, trailer: planTaskTrailer(ctx.planId, first), parsed, log }) ?? undefined;
  if (unsafe !== undefined) return unsafe;
  const status = outcome.timedOut ? null : last.match(/^Task \d+: (?:BLOCKED|PLAN DRIFT)\b\s*(.*)$/);
  if (status !== null) return blockedStop(ctx, first, status[1] || last);
  return maxTurnsStop({ ctx, n: first, outcome, parsed, taskCount });
}

function planLeftoverStop(build, untrackedBefore) {
  const { ctx } = build;
  const { patch, failed } = shelveLeftover(ctx.root, path.join(ctx.logDir, `plan-leftover-${ctx.iteration}.patch`), untrackedBefore);
  if (patch !== null) ctx.say(`plan session leftover saved to ${patch}`);
  if (failed === undefined) return undefined;
  ctx.say(`plan session leftover not cleared: ${clip(failed, 80)}`);
  build.lastTask = null;
  return { kind: 'gate', line: `plan session leftover not cleared: ${failed}`, why: 'The plan session left changes the script could not clear', next: `${patch === null ? 'commit or remove the leftover (git status)' : `the leftover is in ${patch}; restore the tree to HEAD`}, then run exo run again` };
}

function buildNextTask(build, landed) {
  const { ctx } = build;
  const { plan, run: { cap } } = ctx;
  const task = readyTasks(plan.tasks, landed)[0];
  if (task === undefined) {
    const waiting = plan.tasks.filter((entry) => !landed.includes(entry.number)).map((entry) => entry.number);
    return { kind: 'stalled', line: `no ready task: tasks ${waiting.join(', ')} wait on unlanded dependencies`, why: 'They wait on tasks that have not landed', next: 'check the Depends on lines in the plan, then run exo run again' };
  }
  if (ctx.iteration >= cap) {
    return { kind: 'capped', task: task.number, line: `iteration cap ${cap} reached, ${landed.length}/${plan.tasks.length} landed`, why: `The run hit its limit of ${cap} sessions`, next: 'run exo run again to continue, or raise --max-iterations' };
  }
  const stop = budgetStop(ctx, task.number) ?? unreachableInputStop(ctx, task.number) ?? autonomyStop(ctx, task);
  if (stop !== undefined) return stop;
  return buildTask(build, task, landed.length);
}

async function buildTask(build, task, landedCount) {
  const { ctx } = build;
  const n = task.number;
  const startedTask = startTask(ctx, task, landedCount);
  const pending = takePending(ctx, n);
  const log = path.join(ctx.logDir, `iter-${ctx.iteration}-task-${n}.log`);
  const resume = handoffNote(ctx, n) === '' ? build.failedSessions.get(n) ?? null : null;
  build.failedSessions.delete(n);
  const prompt = resume === null ? build.setup.buildPrompt(n, ctx.retryNote + handoffNote(ctx, n)) : ctx.retryNote;
  fs.rmSync(path.join(ctx.root, SCRATCH_FOLDER, `implementer-${n}.md`), { force: true });
  if (landedByChangelogScript(ctx, task)) return landChangelogTask(ctx, n);
  const { before, outcome, parsed } = pending !== null ? replayedSession(ctx, pending) : await spawnTask(build, { task, log, resume, prompt });
  sayIdle(ctx, startedTask);
  writeReplyReport(ctx, n, outcome.timedOut ? '' : parsed.resultText);
  const last = sessionLast(outcome, parsed, ctx.timeoutMs);
  const record = recordSession(build, { task: n, log, parsed, last });
  const marker = takeBlockedMarker(pending);
  noteSession(ctx, n, { outcome, parsed, last, marker });
  return settleTask(build, { n, log, before, outcome, parsed, last, marker, record, startedTask });
}

function startTask(ctx, task, landedCount) {
  const n = task.number;
  ctx.iteration += 1;
  if (ctx.retryNote === '') rebaseOntoMovedBase(ctx);
  if (ctx.currentTask !== n) ctx.lastLandOutput = '';
  ctx.currentTask = n;
  const startedTask = markNow();
  const tryNote = ctx.retryNote === '' ? '' : ` (try ${(ctx.fingerprints.get(n)?.size ?? 0) + 1})`;
  ctx.say(`${startLine({ number: n, subject: taskSubject(task.title), model: ctx.provider.model, effort: ctx.provider.effort })}${tryNote}`);
  noteTask({ n, subject: taskSubject(task.title), landed: landedCount, total: ctx.plan.tasks.length });
  noteStep({ kind: 'task-start', task: n });
  return startedTask;
}

function landChangelogTask(ctx, n) {
  ctx.iteration -= 1;
  markLanded({ ctx, n, record: { byScript: true, iteration: 0, task: n, turns: 0, weightedTokens: 0, cost: 0, peakContext: 0 }, startedTask: null });
  return undefined;
}

function taskPin(ctx, task, resume) {
  const { provider, model, effort } = ctx;
  const retrying = ctx.retryNote !== '';
  const docPin = retrying ? provider.docRetryPin : provider.docPin;
  const basePin = retrying && resume === null && hasPin(provider.retryPin) ? provider.retryPin : { model, effort };
  return isDocTask(task) && hasPin(docPin) ? docPin : basePin;
}

function spawnTask(build, { task, log, resume, prompt }) {
  const { ctx } = build;
  const pin = taskPin(ctx, task, resume);
  return spawnOne(ctx, { prompt, allow: build.setup.taskAllow, settings: ctx.taskSettings, pin: `${ctx.planId}/${task.number}`, log, task: task.number, sessionModel: pin.model ?? ctx.provider.model, sessionEffort: pin.effort, resume });
}

function readMarker(markerFile) {
  return fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : null;
}

function takeBlockedMarker(pending) {
  const markerFile = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'blocked') : null;
  const marker = pending === null && markerFile !== null ? readMarker(markerFile) : pending?.marker ?? null;
  if (markerFile !== null) fs.rmSync(markerFile, { force: true });
  return marker;
}

function markSessionLanded(ctx, { n, record, startedTask }) {
  markLanded({ ctx, n, record, startedTask });
  return undefined;
}

function settleTask(build, session) {
  const { ctx } = build;
  const { n, before, outcome, parsed, last, log } = session;
  const unsafe = unsafeStop({ ctx, n, before, trailer: planTaskTrailer(ctx.planId, n), parsed, log }) ?? undefined;
  if (unsafe !== undefined) return unsafe;
  if (landedTasks(ctx.plan.tasks, ctx.root, ctx.planId).includes(n)) return markSessionLanded(ctx, session);
  if (!outcome.timedOut && parsed.subtype === 'error_max_turns') {
    shelvePartialWork(ctx, n);
    return blockedStop(ctx, n, `hit --max-turns ${agentMaxTurns('build')}`);
  }
  if (!outcome.timedOut && new RegExp(`^Task ${n}: HANDOFF\\b`).test(last) && isFileOnDisk(handoffFile(ctx, n))) {
    ctx.say(`task ${n} handed off at the context limit`);
    ctx.retryNote = '';
    return undefined;
  }
  const statusLine = new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`);
  const blocked = session.marker?.match(statusLine) ?? (outcome.timedOut ? null : last.match(statusLine));
  if (blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'))) return stuckTask(build, session, blocked);
  return failedTask(build, session);
}

async function stuckTask(build, session, blocked) {
  const { ctx } = build;
  const { n, outcome, parsed, last } = session;
  const reason = blocked?.[1] || last;
  const rescue = blocked !== null && !outcome.timedOut && parsed.denials.length > 0 ? landByScript(ctx, n) : null;
  if (rescue?.landed) return markSessionLanded(ctx, session);
  if (await repairTask(ctx, n, reason)) {
    ctx.retryNote = repairedNote(n, reason);
    return undefined;
  }
  return blockedStop(ctx, n, reason);
}

function failedTask(build, session) {
  const attempt = session.outcome.timedOut ? null : landByScript(build.ctx, session.n);
  if (attempt?.landed) return markSessionLanded(build.ctx, session);
  const failure = attempt === null ? session.last : failingLine(attempt.output);
  return retryOrStop(build, { ...session, attempt, failure });
}

function retryOrStop(build, failed) {
  const { ctx, failedSessions, unprovenRetried } = build;
  const { n, attempt, failure, outcome, parsed, last, log } = failed;
  ctx.retryNote = failedAttemptNote({ root: ctx.root, task: n, last, proofEnd: attempt === null ? undefined : failure, log: attempt === null ? log : attempt.log, fallback: outcome.fallback });
  if (attempt !== null && parsed.sessionId) failedSessions.set(n, parsed.sessionId);
  const freeTry = attempt !== null && !unprovenRetried.has(n) && proofNotRun(ctx, n);
  ctx.say(`task ${n} failed: ${outcome.timedOut ? failure : clip(failure, 80)}`);
  if (freeTry) unprovenRetried.add(n);
  else ctx.failedAttempts += 1;
  const repeated = freeTry ? false : recordAttempt({ ctx, n, check: attempt === null ? 'session' : 'land-task', line: failure });
  noteAttempt(ctx, n, { sessionId: failedSessions.get(n), retryNote: ctx.retryNote, freeTried: unprovenRetried.has(n) });
  if (freeTry) return undefined;
  return attemptLimitStop(ctx, failed, repeated);
}

function attemptLimitStop(ctx, { n, log, startedTask }, repeated) {
  if (repeated) {
    const tries = ctx.fingerprints.get(n).size + 1;
    return { kind: 'stalled', task: n, line: `no progress on task ${n} in ${tries} iterations, log ${log}`, why: `Task ${n} did not land in ${tries} tries`, next: fixNext(log) };
  }
  const settled = settleAttempt(ctx, { wallMs: Date.now() - startedTask.wall });
  if (!settled.stop) return undefined;
  return { kind: 'capped', task: n, line: settled.line, why: `The run stopped its failed attempts: ${settled.reason}`, next: fixNext(log) };
}
