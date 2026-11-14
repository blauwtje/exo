#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { commitsOf, landedTasks, planIdOf, taskCommits } from '#plan-landed';
import { criterionCommand, frameOf } from '#plan-frame';
import { redGreen, testPaths } from '#red-green';
import { environmentMs, isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';
import { openGate } from './run-state.mjs';
import { runTail } from './run-tail.mjs';
import { allowRules, denyRules } from './run-session-rules.mjs';
import { appendLog } from './run-session.mjs';
import { SESSION_REFUSAL, insideClaudeCode } from './run-session-env.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { projectEcosystems } from './run-session-ecosystems.mjs';
import { sandboxSettings } from './run-session-sandbox.mjs';
import { gitOut, shelveLeftover, untrackedPaths } from './run-worktree.mjs';
import { planPrompt, sessionMode, taskPrompt } from './run-prompts.mjs';
import { averageLines, clip, deniedLines, detailLines, receiptLines, summaryLines, wallClock } from './run-report.mjs';
import { Refusal } from './cli-refusal.mjs';
import { chooseProvider } from './run-plan-provider.mjs';
import { numberFlag, taskOrder, utcStamp, preflight } from './run-plan-preflight.mjs';
import { setPhase, noteCounts } from './run-plan-notes.mjs';
import { wallBudgetMs } from '../../../lib/loop-budget.mjs';
import { appTail, ensureApp, killApp } from './run-plan-app.mjs';
import { rebaseOntoMovedBase } from './run-plan-rebase.mjs';
import { runDefaults } from './run-config.mjs';
import { planHash } from './run-plan-session.mjs';
import { budgetStop, pausesBefore, parkedStop, recordRunStop, stopRun } from './run-plan-stops.mjs';
import { landRepair, runTailSession } from './run-plan-tail.mjs';
import { buildTasks } from './run-plan-build.mjs';
import { failureLine } from '#attempt-fingerprint';
import { claudeArgs } from './run-session-args.mjs';
import { cacheLines } from './run-cache-tokens.mjs';
import { stopDevServer } from '../../../lib/dev-server.mjs';

const RUN_PLAN_USAGE = `Runs a plan unattended, each unlanded task in a fresh headless claude process, then the review tail.

  node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
    [--provider <name>] [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--max-run-usd <x>]
    [--session auto|task|plan] [--claude <path>] [--plugin-dir <path>] [--dry-run]

Exit 0 done with gate PASS, 3 parked, 1 any other stop, 2 refusal or bad arguments.
Logs, summary.txt, tasks.json and progress.md go to .exo/run-plan/<plan-id>/<UTC time>/.`;

const DEFAULT_TIMEOUT_MINUTES = 60;

const RUN_PLAN_FLAG_KINDS = {
  root: 'value', provider: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
  'max-budget-usd': 'value', 'max-run-usd': 'value', session: 'value', claude: 'value', 'plugin-dir': 'value', 'dry-run': 'boolean'
};

function requirePlanArgument(argument) {
  if (argument === undefined || argument.startsWith('--')) throw new UsageError('the first argument names the plan file');
  return argument;
}

function runPlanOptions(flags, defaults = {}) {
  const sessionFlag = flags.session ?? 'auto';
  if (!['auto', 'task', 'plan'].includes(sessionFlag)) throw new UsageError("flag '--session' needs auto, task or plan");
  return {
    sessionFlag,
    maxIterations: numberFlag(flags['max-iterations'], 'max-iterations', { integer: true }),
    timeoutMs: (numberFlag(flags.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES) * 60_000,
    sessionCap: numberFlag(flags['max-budget-usd'], 'max-budget-usd'),
    runCap: numberFlag(flags['max-run-usd'] ?? defaults.maxRunUsd, 'max-run-usd')
  };
}

const STOP_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

function stopRecorder(ctx) {
  const { run, say } = ctx;
  return (signal) => {
    const landLine = ctx.currentTask !== null && ctx.lastLandTask === ctx.currentTask ? failureLine(ctx.lastLandOutput) : '';
    const stop = { kind: 'signal', line: `stopped by ${signal}${landLine === '' ? '' : `; land-task: ${landLine.replace(/^land-task: /, '')}`}`, why: `stopped by ${signal}` };
    recordRunStop(ctx, stop, 1);
    appendLog(path.join(run.logDir, 'summary.txt'), `${detailLines(run, stop).join('\n')}\n`, fs.writeFileSync);
    process.stdout.write(`run-plan: stop: ${stop.line}\n`);
    if (ctx.liveSessions === 0) process.exit(1);
  };
}

function watchStopSignals(ctx) {
  const onStopSignal = stopRecorder(ctx);
  for (const signal of STOP_SIGNALS) process.once(signal, onStopSignal);
  return () => {
    for (const signal of STOP_SIGNALS) process.off(signal, onStopSignal);
  };
}

function finishRun(ctx, { stop, exitCode: planned, progressFile }) {
  const { say, run } = ctx;
  const exitCode = stopRun(ctx, stop, planned);
  stopDevServer(path.join(run.logDir, 'state.json'));
  for (const line of averageLines(ctx.landedStats)) say(line);
  for (const line of receiptLines(ctx.spendLog ?? [])) say(line);
  if (exitCode === 0) appendLog(progressFile, 'RUN COMPLETE\n');

  const detail = detailLines(run, stop);
  const stopLine = detail.pop();
  const cacheReport = run.records.flatMap((record) => cacheLines(record, run.cacheWriteBar).map((line) => `${record.task === null ? `Iteration ${record.iteration} ${record.kind}` : `Task ${record.task}`}: ${line}`));
  appendLog(path.join(run.logDir, 'summary.txt'), `${[...detail, ...cacheReport, stopLine].join('\n')}\n`, fs.writeFileSync);
  const refused = deniedLines(run.records);
  if (process.env.EXO_RUN_DIR && refused.length > 0) appendLog(path.join(process.env.EXO_RUN_DIR, 'denied.txt'), `${refused.join('\n')}\n`);
  process.stdout.write(`${summaryLines(run, stop).join('\n')}\n`);
  return exitCode;
}

function printDryRun(settings) {
  const { provider, cap, timeoutMs, chosen, order, root, claude, sessionCap, pluginDir, taskAllow, tailAllow, planPath, plan, buildPrompt } = settings;
  const { model, effort, sandbox } = provider;
  const first = order[0];
  process.stdout.write([
    `Provider: ${provider.name}`,
    `Model: ${model}`,
    `Effort: ${provider.asked} -> ${effort}`,
    'Env:', ...provider.shown.map(([variable, value]) => `  ${variable}=${value}`),
    `Caps: ${cap} iterations, ${timeoutMs / 60_000} minutes per session, ${provider.contextBudget} tokens of context per task`,
    `Session: ${chosen.mode}`,
    `Order: ${order.length === 0 ? 'every task has landed' : order.map((number) => `Task ${number}`).join(', ')}`,
    sandbox.enabled
      ? `Sandbox: on, writes in ${root}, network: ${sandbox.allowedDomains.length === 0 ? 'none' : sandbox.allowedDomains.join(', ')}`
      : `Sandbox: off (${sandbox.reason})`,
    `Spawn: ${[claude.command, ...claude.prefix].join(' ')} ${claudeArgs({ model, effort, budget: sessionCap === undefined ? undefined : String(sessionCap), allow: ['<allow>'], settings: sandbox.enabled ? '<sandbox settings>' : null, pluginDir, deny: denyRules({ planPath }) }).join(' ')}`,
    'Allow:', ...taskAllow.map((rule) => `  ${rule}`),
    'Allow in the tail:', ...tailAllow.filter((rule) => !taskAllow.includes(rule)).map((rule) => `  ${rule}`),
    'Deny:', ...denyRules({ planPath }).map((rule) => `  ${rule}`),
    `First prompt: ${first === undefined ? 'none: every task has landed, the script runs the review tail' : chosen.mode === 'plan' ? planPrompt({ plan, planPath, numbers: order, root, sandbox: sandbox.enabled }) : buildPrompt(first)}`,
    ''
  ].join('\n'));
}

function doneStop({ run, gate, plan, branch }) {
  run.verifyLines = `${gate.stdout ?? ''}`.split('\n').filter((line) => /^(FAIL|WARN)\b/.test(line));
  const pass = gate.status === 0;
  const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
  const land = process.env.EXO_RUN_DIR ? frameOf(plan.frame).land : null;
  return {
    kind: pass ? 'done' : 'gate',
    line: `done, ${plan.tasks.length}/${plan.tasks.length} tasks landed, gate ${pass ? 'PASS' : 'FAIL'}`,
    gate: pass ? 'PASS' : 'FAIL',
    next: pass
      ? `${land === null ? `review branch ${branch}, then push it or open a pull request` : `exo run lands branch ${branch} per Land: ${land}`}${manual > 0 ? `; ${manual} manual check${manual === 1 ? '' : 's'} are listed in the detail file` : ''}`
      : `read the failing lines in the detail file, fix them on ${branch}, then run exo run again`
  };
}

async function main(argv) {
  const planArgument = requirePlanArgument(argv[0]);
  const flags = parseFlags(argv.slice(1), RUN_PLAN_FLAG_KINDS, { usage: RUN_PLAN_USAGE });
  const options = { planArgument, flags, ...runPlanOptions(flags, runDefaults(os.homedir())) };
  try {
    return await runPlan(options);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
}

async function runPlan(options) {
  const setup = planRun(options);
  if (options.flags['dry-run']) {
    printDryRun(setup);
    return 0;
  }
  const { ctx, progressFile, startCommit } = startRun(setup);
  const stopWatching = watchStopSignals(ctx);
  const built = await buildTasks(ctx, setup);
  const buildStop = withLeftover(ctx, built);
  const verdict = await verifyRun(ctx, buildStop, { startCommit, progressFile });
  stopWatching();
  return finishRun(ctx, { ...verdict, progressFile });
}

function planRun(options) {
  const { planArgument, flags } = options;
  if (!flags['dry-run'] && insideClaudeCode()) throw new Refusal(SESSION_REFUSAL);
  const { claude, planPath, root, plan, branch } = preflight(planArgument, flags);
  const project = { root, planFiles: plan.tasks.flatMap((task) => task.files.map((file) => file.path)) };
  const ecosystemEnv = projectEcosystems(project).env;
  const provider = chooseProvider(flags, os.homedir(), project);
  const pluginDir = flags['plugin-dir'] === undefined ? null : path.resolve(flags['plugin-dir']);
  const planId = planIdOf(planPath);
  const startCommits = commitsOf(root);
  const landedAtStart = landedTasks(plan.tasks, startCommits, planId);
  const unlanded = plan.tasks.filter((task) => !landedAtStart.includes(task.number));
  const cap = options.maxIterations ?? 2 * unlanded.length;
  const chosen = sessionMode(options.sessionFlag, unlanded);
  if (chosen.refused !== undefined) throw new Refusal(chosen.refused);
  if (!flags['dry-run'] && !process.env.EXO_RUN_DIR && unlanded.some((task) => pausesBefore(plan, task))) {
    throw new Refusal('the plan sets an Autonomy pause, which exo run keeps the approval for: start it with exo run');
  }
  const order = taskOrder(plan.tasks, landedAtStart);
  const base = { ...options, claude, planPath, root, plan, branch, ecosystemEnv, provider, pluginDir, planId, startCommits, landedAtStart, cap, chosen, order };
  return { ...base, ...sessionRules(base) };
}

function sessionRules({ root, planPath, plan, planId, provider }) {
  const { sandbox } = provider;
  const learnings = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'learnings.md');
  return {
    taskAllow: allowRules({ root, planPath, plan, sandbox: sandbox.enabled }),
    tailAllow: allowRules({ root, planPath, plan, tail: true, sandbox: sandbox.enabled }),
    repairAllow: allowRules({ root, planPath, plan, repair: true, sandbox: sandbox.enabled }),
    taskSettings: sandboxSettings(sandbox),
    tailSettings: sandboxSettings(sandbox, { tail: true }),
    learnings,
    buildPrompt: (number, retryNote = '') => taskPrompt({ plan, planPath, number, root, learnings, sandbox: sandbox.enabled, retryNote })
  };
}

function excludeRunScratch(root) {
  try {
    excludeScratch(root);
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
    throw new Refusal(`scratch-exclude: ${error.message}`);
  }
}

function readStartCommit({ root, planId, landedAtStart }) {
  const startFile = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'start-commit');
  if (!isFileOnDisk(startFile) && landedAtStart.length === 0) fs.writeFileSync(startFile, `${gitOut(root, ['rev-parse', 'HEAD'])}\n`);
  return isFileOnDisk(startFile) ? fs.readFileSync(startFile, 'utf8').trim() : null;
}

function runRecord(setup, logDir) {
  const { planPath, plan, branch, cap, root, provider, landedAtStart, startCommits, planId } = setup;
  const startedAt = Date.now();
  const run = { planPath, plan, branch, cap, root, contextBudget: provider.contextBudget, cacheWriteBar: provider.cacheWriteBar, logDir, records: [], landings: new Map(), uncommitted: new Set(), verifyLines: [], elapsed: () => Date.now() - startedAt };
  for (const number of landedAtStart) {
    const task = plan.tasks.find((entry) => entry.number === number);
    run.landings.set(number, { before: true, sha: (taskCommits(task, startCommits, planId)[0] ?? '').slice(0, 12) });
  }
  return run;
}

function openProgress({ plan, planPath, branch, landedAtStart }, logDir) {
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
  return { progressFile, passes, writeTasks, say };
}

function startRun(setup) {
  const { root, plan, planPath, branch, planId, landedAtStart } = setup;
  setPhase('build');
  excludeRunScratch(root);
  const logDir = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, utcStamp());
  fs.mkdirSync(logDir, { recursive: true });
  if (!isFileOnDisk(setup.learnings)) fs.writeFileSync(setup.learnings, '# Learnings\n');
  const startCommit = readStartCommit(setup);
  const run = runRecord(setup, logDir);
  const progress = openProgress(setup, logDir);
  process.on('exit', killApp);
  progress.writeTasks();
  noteCounts({ landed: landedAtStart.length, total: plan.tasks.length });
  if (process.env.EXO_RUN_DIR) for (const name of ['blocked', 'parked']) fs.rmSync(path.join(process.env.EXO_RUN_DIR, name), { force: true });
  progress.say(`run start: ${path.relative(root, planPath) || planPath}, branch ${branch}, ${plan.tasks.length} tasks (${plan.tasks.length - landedAtStart.length} to build)`);
  const ctx = runContext(setup, { run, logDir, ...progress });
  ctx.planAtStart = planHash(ctx);
  return { ctx, progressFile: progress.progressFile, startCommit };
}

function runContext(setup, { run, logDir, passes, writeTasks, say }) {
  const { repairAllow, taskSettings, root, branch, provider, planPath, plan, planId, claude, pluginDir, ecosystemEnv, timeoutMs, sessionCap, runCap, tailAllow, tailSettings } = setup;
  const ledgerFile = path.join(logDir, 'sessions.jsonl');
  const app = frameOf(plan.frame).app;
  const appLog = path.join(logDir, 'app.log');
  const appDeadlineMs = environmentMs('EXO_APP_READY_MS', 120_000);
  return { run, passes, writeTasks, landedStats: [], planLandedCount: 0, lastLandOutput: '', lastLandTask: null, retryNote: '', scriptTried: new Set(), repaired: new Set(), repairAllow, taskSettings, root, branch, say, logDir, iteration: 0, untrackedAtStart: new Set(untrackedPaths(root)), app, appLog, appDeadlineMs, appHandle: null, appIsReady: false, fetchNoted: false, provider, fingerprints: new Map(), failedAttempts: 0, planPath, plan, planId, ledgerFile, claude, pluginDir, ecosystemEnv, timeoutMs, sessionCap, runCap, liveSessions: 0, currentTask: null, tailSessions: 0, tailAllow, tailSettings, spent: 0, sessionCosts: new Map() };
}

function withLeftover(ctx, { stop, lastTask }) {
  if (stop === undefined || ['parked', 'autonomy', 'breach'].includes(stop.kind) || lastTask === null) return stop;
  const { patch, failed } = shelveLeftover(ctx.root, path.join(ctx.logDir, `task-${lastTask}-leftover.patch`), ctx.untrackedAtStart);
  let shelved = stop;
  if (patch !== null) {
    ctx.say(`task ${lastTask} leftover saved to ${patch}`);
    shelved = { ...shelved, next: `${shelved.next}; task ${lastTask}'s edits are in ${patch}, git apply it to pick them up` };
  }
  if (failed !== undefined) {
    ctx.say(`task ${lastTask} leftover not cleared: ${clip(failed, 80)}`);
    shelved = { ...shelved, line: `${shelved.line}; leftover not cleared: ${failed}` };
  }
  return shelved;
}

async function appStop(ctx) {
  if (await ensureApp(ctx)) return undefined;
  ctx.say('app not ready');
  return { kind: 'setup', line: `app not ready: ${ctx.app.ready ?? 'no Ready: url'} did not answer within ${Math.round(ctx.appDeadlineMs / 1000)} s, app log ends: ${appTail(ctx)}`, why: 'The plan App did not become ready', next: `check the App: start command and Ready: url in the plan and ${ctx.appLog}, then run exo run again` };
}

async function verifyRun(ctx, buildStop, files) {
  const stop = buildStop ?? budgetStop(ctx) ?? (await appStop(ctx));
  if (stop !== undefined) return { stop, exitCode: 1 };
  return finalGate(ctx, files);
}

async function finalGate(ctx, { startCommit, progressFile }) {
  const { planPath, plan, root, branch, say, run } = ctx;
  setPhase('verify');
  const gateStop = (await successGate(ctx, startCommit)) ?? reviewRebaseStop(ctx, progressFile);
  if (gateStop !== null) return { stop: { gate: 'FAIL', ...gateStop }, exitCode: 1 };
  say('all tasks landed, final review start');
  const tail = runTail({ planPath, root });
  return { stop: doneStop({ run, gate: tail.gate, plan, branch }), exitCode: tail.gate.status === 0 ? 0 : 1 };
}

function redGreenSkip(plan, command, startCommit) {
  if (plan.successRed !== null) return `Red: none (${plan.successRed.reason})`;
  if (/^Product run: none\b/m.test(plan.frame['Success criterion'] ?? '')) return 'Product run: none';
  if (command === null || command.startsWith('mcp:')) return 'no shell Success command';
  if (startCommit === null) return "the run's start commit is unknown: tasks landed before start-commit was recorded";
  return null;
}

async function successGate(ctx, startCommit) {
  const { plan, root, run, say } = ctx;
  const command = criterionCommand(plan.frame['Success criterion'] ?? '');
  const skip = redGreenSkip(plan, command, startCommit);
  if (skip !== null) {
    run.redGreenLine = `Red-green: skipped (${skip})`;
    say(run.redGreenLine);
    return null;
  }
  const evaluate = () => redGreen({
    root, base: startCommit, command, repeat: Number.isInteger(plan.successRepeat?.count) ? plan.successRepeat.count : 1,
    overlay: testPaths(gitOut(root, ['diff', '--name-only', '-z', `${startCommit}..HEAD`], { trim: false }).split('\0').filter(Boolean)),
    timeoutMs: wallBudgetMs()
  });
  let result = evaluate();
  if (result.outcome !== 'proved') {
    say(`red-green: ${result.outcome}, repair session`);
    const session = await runTailSession(ctx, { kind: 'fix', prompt: `The Success criterion \`${command}\` must fail on the run's start commit ${startCommit.slice(0, 12)} (with the tests of this run laid over it) and pass on the head. The check found:\n${result.lines.join('\n')}\n\nChange the tests or the product so the command proves the work; do not commit, the run lands your edits; end on one line.` });
    if (session.stop !== undefined) return session.stop;
    const landStop = landRepair(ctx);
    if (landStop !== null) return landStop;
    result = evaluate();
  }
  run.redGreenLine = result.outcome === 'proved' ? 'Red-green: proved' : `Red-green: ${result.outcome}: ${result.lines[0]}`;
  say(run.redGreenLine);
  return result.outcome === 'proved' ? null : { kind: 'gate', line: `red-green: ${result.outcome}: ${result.lines[0]}`, why: `The Success criterion is not proved red-green (${clip(result.lines[0], 80)})`, next: 'fix the Success criterion or add Red: none (<reason>), then run exo run again', gate: 'FAIL' };
}

function reviewRebaseStop(ctx, progressFile) {
  const moved = rebaseOntoMovedBase(ctx);
  if (moved === undefined || !process.env.EXO_RUN_DIR) return null;
  const reason = 'rebase conflict';
  openGate(process.env.EXO_RUN_DIR, { source: 'land', action: `rebase ${ctx.branch} onto ${moved.conflict} yourself in ${ctx.root}`, reason });
  return { ...parkedStop({ line: `${reason} onto ${moved.conflict}`, log: progressFile }), gate: 'FAIL' };
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
