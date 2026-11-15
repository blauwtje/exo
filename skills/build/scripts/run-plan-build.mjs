import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cacheFields } from './run-cache-tokens.mjs';
import { failingLine } from '#attempt-fingerprint';
import { landedTasks, planTaskTrailer } from '#plan-landed';
import { readyTasks } from '#plan-waves';
import { SCRATCH_FOLDER } from '#scratch-path';
import { agentMaxTurns } from './run-session-args.mjs';
import { deniedFields, parseStream } from './run-session-stream.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { shelveLeftover, untrackedPaths, GIT_LIMIT, breachOf, worktreeTree, snapshot } from './run-worktree.mjs';
import { planPrompt } from './run-prompts.mjs';
import { clip, numbersText, startLine, taskSubject, idleLine, landedLine, planLandedLine, planSessionLine, scriptLandedLine } from './run-report.mjs';
import { hasPin, isDocTask } from './run-plan-provider.mjs';
import { sessionLast } from './run-plan-preflight.mjs';
import { noteTask, noteStep, journalSteps, savedSpend } from './run-plan-notes.mjs';
import { proofNotRun, recordAttempt, settleAttempt, writeReplyReport } from './run-plan-attempts.mjs';
import { rebaseOntoMovedBase } from './run-plan-rebase.mjs';
import { handoffFile, handoffNote, spawnOne, planHash } from './run-plan-session.mjs';
import { autonomyStop, blockedStop, budgetStop, maxTurnsStop, shelvePartialWork, unreachableInputStop, unsafeStop } from './run-plan-stops.mjs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { ruledOutText } from '../../../lib/ruled-out.mjs';
import { environmentMs } from '#script-flags';
import { landChangelogTask } from './changelog-task.mjs';
import { appendLog } from './run-session.mjs';
import { SCRIPT, PLUGIN_ROOT } from './run-session-paths.mjs';
import { gitLine } from '#git';
import { CHILD_OUTPUT_LIMIT } from '#process-tree';
import { isUnreachableInput } from '#plan-inputs';
import { PlanError, parsePlan } from '#plan-tasks';
import { resumePoint } from './run-state.mjs';

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
  if (landedByChangelogScript(ctx, task)) return markScriptLanded(ctx, n);
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

function markScriptLanded(ctx, n) {
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

function markNow() {
  return { wall: Date.now(), mono: performance.now() };
}

function sayIdle(ctx, started) {
  const line = idleLine(Date.now() - started.wall, performance.now() - started.mono, environmentMs('EXO_IDLE_MS', 60_000));
  if (line !== null) ctx.say(line);
}

function markLanded({ ctx, n, record, startedTask }) {
  const { root, say, run, plan, passes } = ctx;
  ctx.lastLandOutput = '';
  ctx.fingerprints.delete(n);
  ctx.retryNote = '';
  run.landings.set(n, { sha: gitLine(root, ['rev-parse', '--short=12', 'HEAD'], GIT_LIMIT), record });
  passes.add(n);
  noteStep({ kind: 'commit', task: n, sha: run.landings.get(n).sha });
  fs.rmSync(handoffFile(ctx, n), { force: true });
  ctx.writeTasks();
  const sha = run.landings.get(n).sha;
  if (record.byScript) {
    say(scriptLandedLine({ number: n, sha }));
  } else if (startedTask === null) {
    ctx.planLandedCount += 1;
    say(planLandedLine({ number: n, sha }));
  } else {
    const ms = Math.round(performance.now() - startedTask.mono);
    ctx.landedStats.push({ count: 1, ms, turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost });
    say(landedLine({ number: n, sha, ms, turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost }));
  }
  noteTask({ n, subject: taskSubject(plan.tasks.find((entry) => entry.number === n).title), landed: passes.size, total: plan.tasks.length });
  for (const line of (gitLine(root, ['status', '--porcelain'], { ...GIT_LIMIT, trim: false }) ?? '').split('\n').filter(Boolean)) {
    const file = line.slice(3);
    if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
  }
}

function landByScript(ctx, n) {
  const { root, planPath, planId, plan } = ctx;
  const log = path.join(ctx.logDir, `land-task-${n}.log`);
  const answer = spawnSync(process.execPath, [SCRIPT.landTask, '--plan', planPath, '--task', String(n), '--root', root], {
    cwd: root, env: { ...process.env, EXO_RUN_TASK: `${planId}/${n}` }, encoding: 'utf8', maxBuffer: CHILD_OUTPUT_LIMIT, timeout: ctx.timeoutMs
  });
  const output = `${answer.stdout ?? ''}${answer.stderr ?? ''}`;
  appendLog(log, output);
  ctx.lastLandOutput = output;
  ctx.lastLandTask = n;
  const landed = answer.status === 0 && landedTasks(plan.tasks, root, planId).includes(n);
  noteStep({ kind: 'check', task: n, passed: landed, line: landed ? '' : failingLine(output) });
  return { landed, output, log };
}

function landedByChangelogScript(ctx, task) {
  if (!isDocTask(task) || ctx.scriptTried.has(task.number)) return false;
  ctx.scriptTried.add(task.number);
  return landChangelogTask({ root: ctx.root, task, land: () => landByScript(ctx, task.number).landed });
}

export function failedAttemptNote({ root, task, last, proofEnd, log, fallback }) {
  const lines = [
    `The previous attempt did not land task ${task}. Its last result line: ${last}`,
    ...(proofEnd === undefined ? [] : [`The script's proof and land output ended: ${proofEnd}`]),
    `Its log: ${log}`,
    ...(fallback ? [`That attempt ran on ${fallback.to} instead of ${fallback.from} because the provider was overloaded.`] : []),
    ...[ruledOutText(root, task).trimEnd()].filter((text) => text !== '')
  ];
  return `\n${lines.join('\n')}`;
}

function landInOrder({ ctx, numbers, record, started }) {
  for (const n of numbers) {
    const attempt = landedTasks(ctx.plan.tasks, ctx.root, ctx.planId).includes(n) ? { landed: true } : landByScript(ctx, n);
    if (attempt.landed) {
      markLanded({ ctx, n, record, startedTask: started });
      continue;
    }
    ctx.say(`task ${n} not landed by the script: ${clip(failingLine(attempt.output), 80)}`);
    ctx.retryNote = failedAttemptNote({ root: ctx.root, task: n, last: failingLine(attempt.output), log: attempt.log, fallback: ctx.sessionFallback });
    return;
  }
}

function notePlanSession(ctx, record, startedPlan) {
  if (ctx.planLandedCount === 0) return;
  const entry = { count: ctx.planLandedCount, ms: Math.round(performance.now() - startedPlan.mono), turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost };
  ctx.landedStats.push(entry);
  ctx.say(planSessionLine(entry));
}

function withoutFields(line) {
  return line.replace(/(?:Files|Proof):[^|]*/g, '');
}

function withoutAddedRed(line, changed) {
  return /\bRed:/.test(line) ? changed : changed.replace(/\s*\|\s*Red: none \([^|]*\)/, '');
}

function onlyFieldsChanged(before, after, n) {
  const old = before.split('\n');
  const now = after.split('\n');
  const from = old.findIndex((line) => line.startsWith(`### Task ${n}:`));
  const next = old.findIndex((line, index) => index > from && line.startsWith('#'));
  const inTask = (index) => from >= 0 && index > from && (next === -1 || index < next);
  return old.length === now.length && old.every((line, index) => line === now[index] || (inTask(index) && withoutFields(line) === withoutFields(withoutAddedRed(line, now[index]))));
}

function planCheckPasses(ctx) {
  return spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', ctx.planPath, '--root', ctx.root, '--loop', '--run'], { encoding: 'utf8' }).status === 0;
}

function adoptRepair(ctx, text, n) {
  try {
    const fresh = parsePlan(text).tasks.find((entry) => entry.number === n);
    Object.assign(ctx.plan.tasks.find((entry) => entry.number === n), fresh);
    return true;
  } catch (error) {
    if (error instanceof PlanError) return false;
    throw error;
  }
}

function repairPrompt(ctx, n, report) {
  return [
    `Plan repair of task ${n} in ${ctx.planPath}, repository ${ctx.root}.`,
    `Read ${path.join(PLUGIN_ROOT, 'skills', 'build', 'drift-repairer-prompt.md')} and follow its prompt; the task list spec is ${path.join(PLUGIN_ROOT, 'skills', 'spec', 'references', 'task-list.md')}.`,
    `Edit only the Files: or Proof: line of task ${n}, or add \`Red: none (<reason>)\` to its field line; any other change is rejected.`,
    `Drift report: ${report}`
  ].join('\n');
}

function treeBesidePlan(ctx) {
  const planInRoot = path.relative(ctx.root, fs.realpathSync(ctx.planPath));
  return worktreeTree(ctx.root, planInRoot.startsWith('..') || path.isAbsolute(planInRoot) ? null : planInRoot);
}

function treeBreach(ctx, treeBefore) {
  const treeAfter = treeBesidePlan(ctx);
  if (treeBefore === null || treeAfter === null) return 'working tree unreadable';
  return treeAfter === treeBefore ? null : 'working tree changed beyond the plan';
}

async function repairTask(ctx, n, report) {
  const { root, planPath, say, repaired } = ctx;
  if (repaired.has(n) || isUnreachableInput(report)) return false;
  repaired.add(n);
  const before = fs.readFileSync(planPath, 'utf8');
  const treeBefore = treeBesidePlan(ctx);
  say(`task ${n} blocked, repair session: ${clip(report, 80)}`);
  const log = path.join(ctx.logDir, `iter-${ctx.iteration}-repair-${n}.log`);
  const session = await spawnOne(ctx, { prompt: repairPrompt(ctx, n, report), allow: ctx.repairAllow, settings: ctx.taskSettings, pin: `${ctx.planId}/${n}`, log, repair: true });
  if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
  const after = fs.readFileSync(planPath, 'utf8');
  const breach = breachOf(root, session.before, { tail: true }) ?? treeBreach(ctx, treeBefore);
  if (breach === null && after !== before && onlyFieldsChanged(before, after, n) && planCheckPasses(ctx) && adoptRepair(ctx, after, n)) {
    ctx.planAtStart = planHash(ctx);
    say(`task ${n} plan repaired, task runs again`);
    return true;
  }
  fs.writeFileSync(planPath, before);
  say(`task ${n} repair rejected${breach === null ? '' : `: ${breach}`}`);
  return false;
}

function repairedNote(n, reason) {
  return `\nThe previous attempt on task ${n} reported ${clip(reason, 120)}; the plan's field line for it was repaired. Read the plan task again.`;
}

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
