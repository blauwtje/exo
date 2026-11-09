#!/usr/bin/env node

import { cacheFields } from './run-cache-tokens.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { failingLine } from '#attempt-fingerprint';
import { defaultBranch } from '#git';
import { commitsOf, landedTasks, planIdOf, planTaskTrailer, taskCommits } from '#plan-landed';
import { criterionCommand, frameOf } from '#plan-frame';
import { readyTasks } from '#plan-waves';
import { redGreen, testPaths } from '#red-green';
import { environmentMs, isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';
import { openGate } from './run-state.mjs';
import { runTail } from './run-tail.mjs';
import { agentMaxTurns } from './run-session-args.mjs';
import { allowRules } from './run-session-rules.mjs';
import { appendLog } from './run-session.mjs';
import { SESSION_REFUSAL, insideClaudeCode } from './run-session-env.mjs';
import { deniedFields } from './run-session-stream.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { projectEcosystems } from './run-session-ecosystems.mjs';
import { sandboxSettings } from './run-session-sandbox.mjs';
import { gitOut, shelveLeftover, untrackedPaths, worktreeTree } from './run-worktree.mjs';
import { planPrompt, sessionMode, taskPrompt } from './run-prompts.mjs';
import { clip, numbersText, startLine, taskSubject, wallClock } from './run-report.mjs';
import { Refusal } from './run-plan-errors.mjs';
import { hasPin, isDocTask, chooseProvider } from './run-plan-provider.mjs';
import { lastLine, taskOrder, utcStamp, preflight } from './run-plan-preflight.mjs';
import { setPhase, noteTask, noteCounts, noteStop, noteStep } from './run-plan-notes.mjs';
import { noteAttempt, noteSession, replayedSession, restoreResume, takePending } from './run-plan-resume.mjs';
import { attemptsLeft, proofNotRun, recordAttempt, writeReplyReport } from './run-plan-attempts.mjs';
import { appTail, ensureApp, killApp } from './run-plan-app.mjs';
import { rebaseOntoMovedBase } from './run-plan-rebase.mjs';
import { runDefaults } from './run-config.mjs';
import { handoffFile, handoffNote, planHash, spawnOne } from './run-plan-session.mjs';
import { autonomyStop, blockedStop, budgetStop, maxTurnsStop, pausesBefore, parkedStop, unreachableInputStop, unsafeStop } from './run-plan-stops.mjs';
import { failedAttemptNote, landByScript, landedByChangelogScript, markLanded, markNow, noRedProofLine, notePlanSession, sayIdle } from './run-plan-landing.mjs';
import { repairTask, repairedNote } from './run-plan-repair.mjs';
import { landOrRepair, repairThenLand } from './run-plan-land-repair.mjs';
import { printDryRun } from './run-plan-dry-run.mjs';
import { finishRun } from './run-plan-finish.mjs';
import { RUN_PLAN_FLAG_KINDS, requirePlanArgument, runPlanOptions } from './run-plan-flags.mjs';
import { RUN_PLAN_USAGE } from './run-plan-usage.mjs';
import { watchStopSignals } from './run-plan-signals.mjs';
import { landRepair, runTailSession } from './run-plan-tail.mjs';

async function main(argv) {
  const planArgument = requirePlanArgument(argv[0]);
  const flags = parseFlags(argv.slice(1), RUN_PLAN_FLAG_KINDS, { usage: RUN_PLAN_USAGE });
  const { sessionFlag, maxIterations, timeoutMs, sessionCap, runCap } = runPlanOptions(flags, runDefaults(os.homedir()));

  if (!flags['dry-run'] && insideClaudeCode()) {
    process.stdout.write(`run-plan: refused: ${SESSION_REFUSAL}\n`);
    return 2;
  }
  let context;
  try {
    context = preflight(planArgument, flags);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { claude, planPath, root, plan, branch } = context;
  const project = { root, planFiles: plan.tasks.flatMap((task) => task.files.map((file) => file.path)) };
  const ecosystemEnv = projectEcosystems(project).env;
  let provider;
  try {
    provider = chooseProvider(flags, os.homedir(), project);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { model, effort } = provider;
  const pluginDir = flags['plugin-dir'] === undefined ? null : path.resolve(flags['plugin-dir']);
  const planId = planIdOf(planPath);
  const startCommits = commitsOf(root);
  const landedAtStart = landedTasks(plan.tasks, startCommits, planId);
  const cap = maxIterations ?? 2 * (plan.tasks.length - landedAtStart.length);
  const chosen = sessionMode(sessionFlag, plan.tasks.filter((task) => !landedAtStart.includes(task.number)));
  if (chosen.refused !== undefined) {
    process.stdout.write(`run-plan: refused: ${chosen.refused}\n`);
    return 2;
  }
  if (!flags['dry-run'] && !process.env.EXO_RUN_DIR && plan.tasks.some((task) => !landedAtStart.includes(task.number) && pausesBefore(plan, task))) {
    process.stdout.write('run-plan: refused: the plan sets an Autonomy pause, which exo run keeps the approval for: start it with exo run\n');
    return 2;
  }
  const order = taskOrder(plan.tasks, landedAtStart);
  const sandbox = provider.sandbox;
  const taskAllow = allowRules({ root, planPath, plan, sandbox: sandbox.enabled });
  const tailAllow = allowRules({ root, planPath, plan, tail: true, sandbox: sandbox.enabled });
  const repairAllow = allowRules({ root, planPath, plan, repair: true, sandbox: sandbox.enabled });
  const taskSettings = sandboxSettings(sandbox);
  const tailSettings = sandboxSettings(sandbox, { tail: true });
  const learnings = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'learnings.md');
  const buildPrompt = (number, retryNote = '') => taskPrompt({ plan, planPath, number, root, learnings, sandbox: sandbox.enabled, retryNote });

  if (flags['dry-run']) {
    printDryRun({ provider, cap, timeoutMs, chosen, order, sandbox, root, claude, sessionCap, pluginDir, taskAllow, tailAllow, planPath, plan, buildPrompt });
    return 0;
  }

  setPhase('build');
  try {
    excludeScratch(root);
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
    process.stdout.write(`run-plan: refused: scratch-exclude: ${error.message}\n`);
    return 2;
  }
  const logDir = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, utcStamp());
  fs.mkdirSync(logDir, { recursive: true });
  if (!isFileOnDisk(learnings)) fs.writeFileSync(learnings, '# Learnings\n');
  const startFile = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'start-commit');
  if (!isFileOnDisk(startFile) && landedAtStart.length === 0) fs.writeFileSync(startFile, `${gitOut(root, ['rev-parse', 'HEAD'])}\n`);
  const startCommit = isFileOnDisk(startFile) ? fs.readFileSync(startFile, 'utf8').trim() : null;
  const startedAt = Date.now();
  const run = { planPath, plan, branch, cap, root, contextBudget: provider.contextBudget, cacheWriteBar: provider.cacheWriteBar, logDir, records: [], landings: new Map(), uncommitted: new Set(), verifyLines: [], elapsed: () => Date.now() - startedAt };
  for (const number of landedAtStart) {
    const task = plan.tasks.find((entry) => entry.number === number);
    run.landings.set(number, { before: true, sha: (taskCommits(task, startCommits, planId)[0] ?? '').slice(0, 12) });
  }

  const tasksFile = path.join(logDir, 'tasks.json');
  const progressFile = path.join(logDir, 'progress.md');
  const passes = new Set(landedAtStart);
  const writeTasks = () => appendLog(tasksFile, `${JSON.stringify(plan.tasks.map((task) => ({ number: task.number, title: task.title, passes: passes.has(task.number) })), null, 2)}\n`, fs.writeFileSync);
  fs.writeFileSync(progressFile, `# Progress\n\nPlan: ${planPath}\nBranch: ${branch}\n\n`);
  const say = (text) => {
    const line = `[${wallClock(new Date())}] ${text}`;
    appendLog(progressFile, `- ${line}\n`);
    process.stdout.write(`${line}\n`);
  };
  process.on('exit', killApp);
  writeTasks();
  noteCounts({ landed: landedAtStart.length, total: plan.tasks.length });
  if (process.env.EXO_RUN_DIR) for (const name of ['blocked', 'parked']) fs.rmSync(path.join(process.env.EXO_RUN_DIR, name), { force: true });
  say(`run start: ${path.relative(root, planPath) || planPath}, branch ${branch}, ${plan.tasks.length} tasks (${plan.tasks.length - landedAtStart.length} to build)`);


  const ledgerFile = path.join(logDir, 'sessions.jsonl');

  // why: a builder the sandbox kept from running its proof could not see the failure, so its first script proof failure is a free try; once per task, so it cannot loop.
  const unprovenRetried = new Set();
  const failedSessions = new Map();
  let stop;
  let lastTask = null;
  const app = frameOf(plan.frame).app;
  const appLog = path.join(logDir, 'app.log');
  const appDeadlineMs = environmentMs('EXO_APP_READY_MS', 120_000);
  const ctx = { run, passes, writeTasks, landedStats: [], planLandedCount: 0, lastLandOutput: '', lastLandTask: null, retryNote: '', scriptTried: new Set(), repaired: new Set(), repairAllow, taskSettings, root, branch, say, logDir, iteration: 0, untrackedAtStart: new Set(untrackedPaths(root)), app, appLog, appDeadlineMs, appHandle: null, appIsReady: false, fetchNoted: false, provider, fingerprints: new Map(), failedAttempts: 0, planPath, plan, planId, ledgerFile, claude, pluginDir, ecosystemEnv, model, effort, sandbox, timeoutMs, sessionCap, runCap, liveSessions: 0, currentTask: null, tailSessions: 0, tailAllow, tailSettings, spent: 0, sessionCosts: new Map() };
  ctx.planAtStart = planHash(ctx);
  const stopWatching = watchStopSignals(ctx);
  restoreResume(ctx, failedSessions, unprovenRetried);
  if (stop === undefined && chosen.mode === 'plan' && order.length > 0) {
    stop = budgetStop(ctx, order[0]) ?? unreachableInputStop(ctx, order[0]);
    const first = order[0];
    if (stop === undefined) {
      ctx.iteration += 1;
      const startedPlan = markNow();
      const untrackedBefore = new Set(untrackedPaths(root));
      say(`plan session start: tasks ${numbersText(order)}`);
      const log = path.join(logDir, `iter-${ctx.iteration}-plan.log`);
      const { before, outcome, parsed } = await spawnOne(ctx, { prompt: planPrompt({ plan, planPath, numbers: order, root, sandbox: sandbox.enabled }), allow: taskAllow, settings: taskSettings, pin: `${planId}/${first}`, log, kind: 'plan', task: first, taskCount: order.length });
      sayIdle(ctx, startedPlan);
      const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
      const record = { iteration: ctx.iteration, task: first, log, turns: parsed.turns, weightedTokens: parsed.weightedTokens, cost: parsed.cost, peakContext: parsed.peakContext, ...cacheFields(parsed), last, ...deniedFields(parsed) };
      run.records.push(record);
      lastTask = first;
      if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
      stop = unsafeStop(ctx, first, before, planTaskTrailer(planId, first), parsed, log) ?? undefined;
      const status = outcome.timedOut ? null : last.match(/^Task \d+: (?:BLOCKED|PLAN DRIFT)\b\s*(.*)$/);
      if (stop === undefined && status !== null) stop = blockedStop(ctx, first, status[1] || last);
      if (stop === undefined) stop = maxTurnsStop(ctx, first, outcome, parsed, order.length);
      stop = (await landOrRepair(ctx, stop === undefined ? order : [], record, null)) ?? stop;
      notePlanSession(ctx, record, startedPlan);
      if (stop === undefined && landedTasks(plan.tasks, root, planId).length < plan.tasks.length) {
        const { patch, failed } = shelveLeftover(root, path.join(logDir, `plan-leftover-${ctx.iteration}.patch`), untrackedBefore);
        if (patch !== null) say(`plan session leftover saved to ${patch}`);
        if (failed !== undefined) {
          say(`plan session leftover not cleared: ${clip(failed, 80)}`);
          lastTask = null;
          stop = { kind: 'gate', line: `plan session leftover not cleared: ${failed}`, why: 'The plan session left changes the script could not clear', next: `${patch === null ? 'commit or remove the leftover (git status)' : `the leftover is in ${patch}; restore the tree to HEAD`}, then run exo run again` };
        }
      }
    }
  }
  const fix = (log) => `read ${log}, fix the cause, then run exo run again`;
  while (stop === undefined) {
    const landed = landedTasks(plan.tasks, root, planId);
    if (landed.length === plan.tasks.length) break;
    const task = readyTasks(plan.tasks, landed)[0];
    if (task === undefined) {
      const waiting = plan.tasks.filter((entry) => !landed.includes(entry.number)).map((entry) => entry.number);
      stop = { kind: 'stalled', line: `no ready task: tasks ${waiting.join(', ')} wait on unlanded dependencies`, why: 'They wait on tasks that have not landed', next: 'check the Depends on lines in the plan, then run exo run again' };
      break;
    }
    if (ctx.iteration >= cap) {
      stop = { kind: 'capped', task: task.number, line: `iteration cap ${cap} reached, ${landed.length}/${plan.tasks.length} landed`, why: `The run hit its limit of ${cap} sessions`, next: 'run exo run again to continue, or raise --max-iterations' };
      break;
    }
    stop = budgetStop(ctx, task.number) ?? unreachableInputStop(ctx, task.number) ?? autonomyStop(ctx, task);
    if (stop !== undefined) break;
    ctx.iteration += 1;
    const n = task.number;
    if (ctx.retryNote === '') rebaseOntoMovedBase(ctx);
    if (ctx.currentTask !== n) ctx.lastLandOutput = '';
    ctx.currentTask = n;
    const startedTask = markNow();
    say(`${startLine({ number: n, subject: taskSubject(task.title), model, effort })}${ctx.retryNote === '' ? '' : ` (try ${(ctx.fingerprints.get(n)?.size ?? 0) + 1})`}`);
    noteTask({ n, subject: taskSubject(task.title), landed: landed.length, total: plan.tasks.length });
    noteStep({ kind: 'task-start', task: n });
    const pending = takePending(ctx, n);
    const log = path.join(logDir, `iter-${ctx.iteration}-task-${n}.log`);
    const trailer = planTaskTrailer(planId, n);
    const resume = handoffNote(ctx, n) === '' ? failedSessions.get(n) ?? null : null;
    failedSessions.delete(n);
    const prompt = resume === null ? buildPrompt(n, ctx.retryNote + handoffNote(ctx, n)) : ctx.retryNote;
    // why: a report from an earlier try or run process would otherwise stay, and land-task would prove this try from it.
    fs.rmSync(path.join(root, SCRATCH_FOLDER, `implementer-${n}.md`), { force: true });
    if (landedByChangelogScript(ctx, task)) {
      ctx.iteration -= 1;
      markLanded(ctx, n, { byScript: true, iteration: 0, task: n, turns: 0, weightedTokens: 0, cost: 0, peakContext: 0 }, null);
      continue;
    }
    const retrying = ctx.retryNote !== '';
    const docPin = retrying ? provider.docRetryPin : provider.docPin;
    const basePin = retrying && resume === null && hasPin(provider.retryPin) ? provider.retryPin : { model, effort };
    const taskPin = isDocTask(task) && hasPin(docPin) ? docPin : basePin;
    const { before, outcome, parsed } = pending !== null ? replayedSession(ctx, pending) : await spawnOne(ctx, { prompt, allow: taskAllow, settings: taskSettings, pin: `${planId}/${n}`, log, task: n, sessionModel: taskPin.model ?? model, sessionEffort: taskPin.effort, resume });
    sayIdle(ctx, startedTask);
    writeReplyReport(ctx, n, outcome.timedOut ? '' : parsed.resultText);
    const last =outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
    const record = { iteration: ctx.iteration, task: n, log, turns: parsed.turns, weightedTokens: parsed.weightedTokens, cost: parsed.cost, peakContext: parsed.peakContext, ...cacheFields(parsed), last, ...deniedFields(parsed) };
    run.records.push(record);
    lastTask = n;

    const markerFile = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'blocked') : null;
    const marker = pending !== null ? pending.marker ?? null : markerFile !== null && fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : null;
    if (markerFile !== null) fs.rmSync(markerFile, { force: true });
    noteSession(ctx, n, { outcome, parsed, last, marker });

    stop = unsafeStop(ctx, n, before, trailer, parsed, log) ?? undefined;
    if (stop !== undefined) break;
    if (landedTasks(plan.tasks, root, planId).includes(n)) {
      markLanded(ctx, n, record, startedTask);
      continue;
    }
    if (!outcome.timedOut && parsed.subtype === 'error_max_turns') {
      shelvePartialWork(ctx, n);
      stop = blockedStop(ctx, n, `hit --max-turns ${agentMaxTurns('build')}`);
      break;
    }
    if (!outcome.timedOut && new RegExp(`^Task ${n}: HANDOFF\\b`).test(last) && isFileOnDisk(handoffFile(ctx, n))) {
      say(`task ${n} handed off at the context limit`);
      ctx.retryNote = '';
      continue;
    }
    const statusLine = new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`);
    const blocked = marker?.match(statusLine) ?? (outcome.timedOut ? null : last.match(statusLine));
    const stuck = blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'));
    const reason = blocked?.[1] || last;
    const rescue = stuck && blocked !== null && !outcome.timedOut && parsed.denials.length > 0 ? landByScript(ctx, n) : null;
    if (rescue?.landed) {
      markLanded(ctx, n, record, startedTask);
      continue;
    }
    const repairNote = stuck && (await repairTask(ctx, n, reason)) ? repairedNote(n, reason) : null;
    if (repairNote !== null) {
      ctx.retryNote = repairNote;
      continue;
    }
    if (stuck) {
      stop = blockedStop(ctx, n, reason);
      break;
    }
    const attempt = outcome.timedOut ? null : landByScript(ctx, n);
    if (attempt?.landed) {
      markLanded(ctx, n, record, startedTask);
      continue;
    }
    const noRed = attempt === null ? undefined : noRedProofLine(attempt.output);
    if (noRed !== undefined) {
      stop = await repairThenLand(ctx, n, noRed, { record, started: startedTask });
      continue;
    }
    const failure = attempt === null ? last : failingLine(attempt.output);
    ctx.retryNote = failedAttemptNote({ root, task: n, last, proofEnd: attempt === null ? undefined : failure, log: attempt === null ? log : attempt.log, fallback: outcome.fallback });
    if (attempt !== null && parsed.sessionId) failedSessions.set(n, parsed.sessionId);
    const freeTry = attempt !== null && !unprovenRetried.has(n) && proofNotRun(ctx, n);
    say(`task ${n} failed: ${outcome.timedOut ? failure : clip(failure, 80)}`);
    if (freeTry) unprovenRetried.add(n);
    else ctx.failedAttempts += 1;
    const repeated = freeTry ? false : recordAttempt(ctx, n, attempt === null ? 'session' : 'land-task', failure);
    noteAttempt(ctx, n, { sessionId: failedSessions.get(n), retryNote: ctx.retryNote, freeTried: unprovenRetried.has(n) });
    if (repeated) {
      const tries = ctx.fingerprints.get(n).size + 1;
      stop = { kind: 'stalled', task: n, line: `no progress on task ${n} in ${tries} iterations, log ${log}`, why: `Task ${n} did not land in ${tries} tries`, next: fix(log) };
      break;
    }
    if (ctx.failedAttempts >= provider.attemptCap) {
      stop = { kind: 'capped', task: n, line: `attempt cap ${provider.attemptCap} reached`, why: `The run hit its limit of ${provider.attemptCap} failed attempts`, next: fix(log) };
      break;
    }
  }

  if (stop !== undefined && !['parked', 'autonomy', 'breach'].includes(stop.kind) && lastTask !== null) {
    const { patch, failed } = shelveLeftover(root, path.join(logDir, `task-${lastTask}-leftover.patch`), ctx.untrackedAtStart);
    if (patch !== null) {
      say(`task ${lastTask} leftover saved to ${patch}`);
      stop = { ...stop, next: `${stop.next}; task ${lastTask}'s edits are in ${patch}, git apply it to pick them up` };
    }
    if (failed !== undefined) {
      say(`task ${lastTask} leftover not cleared: ${clip(failed, 80)}`);
      stop = { ...stop, line: `${stop.line}; leftover not cleared: ${failed}` };
    }
  }

  let exitCode = 1;
  if (stop === undefined) stop = budgetStop(ctx) ?? undefined;
  if (stop === undefined && !(await ensureApp(ctx))) {
    say('app not ready');
    stop = { kind: 'setup', line: `app not ready: ${app.ready ?? 'no Ready: url'} did not answer within ${Math.round(appDeadlineMs / 1000)} s, app log ends: ${appTail(ctx)}`, why: 'The plan App did not become ready', next: `check the App: start command and Ready: url in the plan and ${appLog}, then run exo run again` };
  }
  if (stop === undefined) {
    setPhase('verify');
    const base = defaultBranch(root);
    const successGate = async () => {
      const criterion = plan.frame['Success criterion'] ?? '';
      const command = criterionCommand(criterion);
      const skip = plan.successRed !== null ? `Red: none (${plan.successRed.reason})`
        : /^Product run: none\b/m.test(criterion) ? 'Product run: none'
          : command === null || command.startsWith('mcp:') ? 'no shell Success command'
            : startCommit === null ? "the run's start commit is unknown: tasks landed before start-commit was recorded" : null;
      if (skip !== null) {
        run.redGreenLine = `Red-green: skipped (${skip})`;
        say(run.redGreenLine);
        return null;
      }
      const evaluate = () => redGreen({
        root, base: startCommit, command, repeat: Number.isInteger(plan.successRepeat?.count) ? plan.successRepeat.count : 1,
        overlay: testPaths(gitOut(root, ['diff', '--name-only', '-z', `${startCommit}..HEAD`], { trim: false }).split('\0').filter(Boolean)),
        timeoutMs: environmentMs('EXO_GATE_TIMEOUT_MS', 1_800_000)
      });
      let result = evaluate();
      if (result.outcome !== 'proved') {
        say(`red-green: ${result.outcome}, repair session`);
        const session = await runSession({ kind: 'fix', prompt: `The Success criterion \`${command}\` must fail on the run's start commit ${startCommit.slice(0, 12)} (with the tests of this run laid over it) and pass on the head. The check found:\n${result.lines.join('\n')}\n\nChange the tests or the product so the command proves the work; do not commit, the run lands your edits; end on one line.` });
        if (session.stop !== undefined) return session.stop;
        const landStop = landRepair(ctx);
        if (landStop !== null) return landStop;
        result = evaluate();
      }
      run.redGreenLine = result.outcome === 'proved' ? 'Red-green: proved' : `Red-green: ${result.outcome}: ${result.lines[0]}`;
      say(run.redGreenLine);
      return result.outcome === 'proved' ? null : { kind: 'gate', line: `red-green: ${result.outcome}: ${result.lines[0]}`, why: `The Success criterion is not proved red-green (${clip(result.lines[0], 80)})`, next: 'fix the Success criterion or add Red: none (<reason>), then run exo run again', gate: 'FAIL' };
    };
    const reviewRebaseStop = () => {
      const moved = rebaseOntoMovedBase(ctx);
      if (moved === undefined || !process.env.EXO_RUN_DIR) return null;
      const reason = 'rebase conflict';
      openGate(process.env.EXO_RUN_DIR, { source: 'land', action: `rebase ${branch} onto ${moved.conflict} yourself in ${root}`, reason });
      return { ...parkedStop(`${reason} onto ${moved.conflict}`, progressFile), gate: 'FAIL' };
    };
    const runSession = (request) => runTailSession(ctx, request);
    const gateStop = (await successGate()) ?? reviewRebaseStop();
    if (gateStop === null) say('all tasks landed, final review start');
    const tail = gateStop === null ? await runTail({ planPath, plan, root, base, branch, runSession, logDir, say, attemptsLeft: attemptsLeft(ctx), attemptCap: provider.attemptCap }) : { stop: gateStop };
    if (tail.stop !== undefined) stop = { gate: 'FAIL', ...tail.stop };
    else {
      const gate = tail.gate;
      run.verifyLines = `${gate.stdout ?? ''}`.split('\n').filter((line) => /^(FAIL|UNPLANNED|WARN)\b/.test(line));
      const pass = gate.status === 0;
      const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
      const land = process.env.EXO_RUN_DIR ? frameOf(plan.frame).land : null;
      stop = {
        kind: pass ? 'done' : 'gate',
        line: `done, ${plan.tasks.length}/${plan.tasks.length} tasks landed, gate ${pass ? 'PASS' : 'FAIL'}`,
        gate: pass ? 'PASS' : 'FAIL',
        next: pass
          ? `${land === null ? `review branch ${branch}, then push it or open a pull request` : `exo run lands branch ${branch} per Land: ${land}`}${manual > 0 ? `; ${manual} manual check${manual === 1 ? '' : 's'} are listed in the detail file` : ''}`
          : `read the failing lines in the detail file, fix them on ${branch}, then run exo run again`
      };
      if (pass) exitCode = 0;
    }
  }
  stopWatching();
  return finishRun(ctx, { stop, exitCode, progressFile });
}

async function entry(argv) {
  try {
    return await main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`run-plan: ${error.message}\n`);
    return 2;
  } finally {
    killApp();
  }
}

if (isMain(import.meta.url)) process.exitCode = await entry(process.argv.slice(2));
