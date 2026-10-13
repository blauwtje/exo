#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { criterionCommand, defaultBranch, frameOf, landedTasks, parsePlan, planIdOf, planTaskTrailer, readyTasks, taskCommits } from '#plan-tasks';
import { killTree, startDetached, waitForUrl, withoutRunVariables } from '#process-tree';
import { redGreen, testPaths } from '#red-green';
import { environmentMs, isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';
import { recordStop, recordTask, updateRun } from './run-state.mjs';
import { runTail } from './run-tail.mjs';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';
import { allowRules, appendLog, childEnv, claudeArgs, DENY_RULES, deniedFields, exoError, isFileOnDisk, parseStream, PLUGIN_ROOT, resolveClaude, sandboxMode, sandboxSettings, SCRIPT, spawnClaude } from './run-session.mjs';
import { breachOf, gitOut, shelveLeftover, snapshot, untrackedPaths } from './run-worktree.mjs';
import { planPrompt, sessionMode, taskPrompt } from './run-prompts.mjs';
import { averageLines, clip, deniedLines, detailLines, landedLine, money, numbersText, startLine, summaryLines, taskSubject, wallClock } from './run-report.mjs';

const RUN_PLAN_USAGE = `Runs a plan unattended, each unlanded task in a fresh headless claude process, then the review tail.

  node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
    [--provider <name>] [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--max-run-usd <x>]
    [--session auto|task|plan] [--claude <path>] [--plugin-dir <path>] [--dry-run]

Exit 0 done with gate PASS, 3 parked, 1 any other stop, 2 refusal or bad arguments.
Logs, summary.txt, tasks.json and progress.md go to .exo/run-plan/<plan-id>/<UTC time>/.`;

const STALL_LIMIT = 2;
const DEFAULT_TIMEOUT_MINUTES = 60;

class Refusal extends Error {}

// why: the run's one app process; the entry point's `finally` kills its tree.
let appPid = null;

function chooseProvider(flags, home) {
  let config;
  try {
    config = loadRunConfig({ home });
  } catch (error) {
    throw new Refusal(`${path.join(configDir(home), 'run.json')} does not load: ${error.message}`);
  }
  const asked = flags.effort ?? config.defaults.effort;
  if (!config.efforts.includes(asked)) throw new Refusal(`unknown effort "${asked}"; use one of ${config.efforts.join(', ')}`);
  const name = flags.provider ?? config.defaults.provider;
  const provider = resolveProvider(config, name, readKeys(path.join(configDir(home), 'keys.env')), asked, home);
  if (provider.refused !== undefined) throw new Refusal(provider.refused);
  return {
    ...provider,
    asked,
    model: flags.model ?? provider.model,
    shown: Object.entries(provider.env).map(([variable, value]) => [variable, String(config.providers[name].env[variable]).includes('${') ? '<from keys.env>' : value]),
    contextBudget: config.defaults.contextBudget,
    sandbox: sandboxMode(config)
  };
}

const lastLine = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';

function taskOrder(tasks, landed) {
  const done = [...landed];
  const order = [];
  for (;;) {
    const next = readyTasks(tasks, done)[0];
    if (next === undefined) return order;
    order.push(next.number);
    done.push(next.number);
  }
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function preflight(planArgument, flags) {
  const claude = resolveClaude({ flag: flags.claude });
  if (claude.refused !== undefined) throw new Refusal(claude.refused);
  const planPath = path.resolve(planArgument);
  if (!isFileOnDisk(planPath)) throw new Refusal(`no plan at ${planArgument}`);
  const root = gitOut(path.resolve(flags.root ?? '.'), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${flags.root ?? process.cwd()} is not inside a git repository`);
  let plan;
  try {
    plan = parsePlan(fs.readFileSync(planPath, 'utf8'));
  } catch (error) {
    throw new Refusal(`the plan does not parse: ${error.message}`);
  }
  const basis = frameOf(plan.frame);
  const branch = gitOut(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  const wanted = basis.branch?.trim() ?? null;
  if (wanted === null) throw new Refusal("the plan's '## Plan basis' names no Branch:");
  if (branch !== wanted) {
    const exists = gitOut(root, ['show-ref', '--verify', '--quiet', `refs/heads/${wanted}`]) !== null;
    throw new Refusal(`the checkout is on branch ${branch ?? '(detached)'}, not the plan's Branch: ${wanted}; run git switch ${exists ? '' : '-c '}${wanted}`);
  }
  if (wanted === defaultBranch(root)) throw new Refusal(`Branch: ${wanted} is the default branch`);
  const tracked = gitOut(root, ['status', '--porcelain', '--untracked-files=no'], { trim: false });
  if (tracked !== '') throw new Refusal(`tracked change in the checkout: ${tracked.split('\n')[0].slice(3)}; commit it first`);
  const check = spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', planPath, '--root', root, '--loop', '--run'], { encoding: 'utf8' });
  if (check.status !== 0) {
    const lines = `${check.stdout}\n${check.stderr}`.split('\n').filter((line) => line.trim() !== '');
    throw new Refusal(`plan-check --loop fails: ${lines.find((line) => line.startsWith('loop: ')) ?? lines[0] ?? `exit ${check.status}`}`);
  }
  return { claude, planPath, root, plan, branch };
}

function numberFlag(value, name, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new UsageError(`flag '--${name}' needs a positive ${integer ? 'integer' : 'number'}`);
  return number;
}

function setPhase(phase) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) updateRun(path.resolve(dir, '..', '..', '..'), path.basename(dir), { phase });
}

const STOP_PHASE = { 3: 'parked' };

function noteTask(task) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) recordTask(path.resolve(dir, '..', '..', '..'), path.basename(dir), task);
}

function noteStop(stop) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) recordStop(path.resolve(dir, '..', '..', '..'), path.basename(dir), stop);
}

async function main(argv) {
  const [planArgument, ...rest] = argv;
  if (planArgument === undefined || planArgument.startsWith('--')) throw new UsageError('the first argument names the plan file');
  const flags = parseFlags(rest, {
    root: 'value', provider: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
    'max-budget-usd': 'value', 'max-run-usd': 'value', session: 'value', claude: 'value', 'plugin-dir': 'value', 'dry-run': 'boolean'
  }, { usage: RUN_PLAN_USAGE });
  const maxIterations = numberFlag(flags['max-iterations'], 'max-iterations', { integer: true });
  const timeoutMs = (numberFlag(flags.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES) * 60_000;
  const sessionFlag = flags.session ?? 'auto';
  if (!['auto', 'task', 'plan'].includes(sessionFlag)) throw new UsageError("flag '--session' needs auto, task or plan");
  const sessionCap = numberFlag(flags['max-budget-usd'], 'max-budget-usd');
  const runCap = numberFlag(flags['max-run-usd'], 'max-run-usd');

  let context;
  try {
    context = preflight(planArgument, flags);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { claude, planPath, root, plan, branch } = context;
  let provider;
  try {
    provider = chooseProvider(flags, os.homedir());
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { model, effort } = provider;
  const pluginDir = flags['plugin-dir'] === undefined ? null : path.resolve(flags['plugin-dir']);
  const planId = planIdOf(planPath);
  const landedAtStart = landedTasks(plan.tasks, root, planId);
  const cap = maxIterations ?? 2 * (plan.tasks.length - landedAtStart.length);
  const chosen = sessionMode(sessionFlag, plan.tasks.filter((task) => !landedAtStart.includes(task.number)));
  if (chosen.refused !== undefined) {
    process.stdout.write(`run-plan: refused: ${chosen.refused}\n`);
    return 2;
  }
  const order = taskOrder(plan.tasks, landedAtStart);
  const sandbox = provider.sandbox;
  const taskAllow = allowRules({ root, planPath, plan, sandbox: sandbox.enabled });
  const tailAllow = allowRules({ root, planPath, plan, tail: true, sandbox: sandbox.enabled });
  const taskSettings = sandboxSettings(sandbox);
  const tailSettings = sandboxSettings(sandbox, { tail: true });
  const learnings = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'learnings.md');
  const buildPrompt = (number, retryNote = '') => taskPrompt({ plan, planPath, number, root, learnings, sandbox: sandbox.enabled, retryNote });

  if (flags['dry-run']) {
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
      `Spawn: ${[claude.command, ...claude.prefix].join(' ')} ${claudeArgs({ model, effort, budget: sessionCap === undefined ? undefined : String(sessionCap), allow: ['<allow>'], settings: sandbox.enabled ? '<sandbox settings>' : null, pluginDir }).join(' ')}`,
      'Allow:', ...taskAllow.map((rule) => `  ${rule}`),
      'Allow in the tail:', ...tailAllow.filter((rule) => !taskAllow.includes(rule)).map((rule) => `  ${rule}`),
      'Deny:', ...DENY_RULES.map((rule) => `  ${rule}`),
      `First prompt: ${first === undefined ? 'none: every task has landed, the script runs the review tail' : chosen.mode === 'plan' ? planPrompt({ plan, planPath, numbers: order, root }) : buildPrompt(first)}`,
      ''
    ].join('\n'));
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
  const run = { planPath, plan, branch, cap, root, contextBudget: provider.contextBudget, logDir, records: [], landings: new Map(), uncommitted: new Set(), verifyLines: [], elapsed: () => Date.now() - startedAt };
  for (const number of landedAtStart) {
    const task = plan.tasks.find((entry) => entry.number === number);
    run.landings.set(number, { before: true, sha: (taskCommits(task, root, planId)[0] ?? '').slice(0, 12) });
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
  writeTasks();
  if (process.env.EXO_RUN_DIR) for (const name of ['blocked', 'parked']) fs.rmSync(path.join(process.env.EXO_RUN_DIR, name), { force: true });
  say(`run start: ${path.relative(root, planPath) || planPath}, branch ${branch}, ${plan.tasks.length} tasks (${plan.tasks.length - landedAtStart.length} to build)`);

  const planHash = () => (isFileOnDisk(planPath) ? createHash('sha256').update(fs.readFileSync(planPath)).digest('hex') : 'missing');
  const planAtStart = planHash();
  const planBreach = () => (planHash() === planAtStart ? null : 'plan changed');

  const ledgerFile = path.join(logDir, 'sessions.jsonl');
  let spent = 0;
  const budgetStop = () => (runCap !== undefined && spent >= runCap
    ? { line: `budget: ${money(spent)} of ${money(runCap)}`, why: `The run spent its budget of ${money(runCap)}`, next: 'raise --max-run-usd, then run exo run again' }
    : null);
  const handoffFile = (number) => path.join(root, SCRATCH_FOLDER, `handoff-task-${number}.md`);
  const handoffNote = (number) => (isFileOnDisk(handoffFile(number))
    ? `\nA previous session ran out of context and left a hand-off: read ${handoffFile(number)} first, then continue task ${number} from it.`
    : '');
  // why: the stall guard rewrites each Bash command, which then matches no Bash allow rule; only sandboxed sessions run Bash without one.
  const stallGuardOn = (kind) => sandbox.enabled && ['task', 'plan'].includes(kind);
  const spawnOne = async ({ prompt, allow, settings, pin, log, kind = 'task', task = null, sessionModel = model }) => {
    if (['task', 'plan'].includes(kind) && !(await ensureApp())) say(`app not ready, app log ends: ${appTail()}`);
    const before = snapshot(root);
    const budget = [sessionCap, runCap === undefined ? undefined : Number((runCap - spent).toFixed(6))].filter((value) => value !== undefined).reduce((low, value) => Math.min(low, value), Infinity);
    const outcome = await spawnClaude(claude, claudeArgs({ model: sessionModel, effort, budget: Number.isFinite(budget) ? String(budget) : undefined, allow, settings, kind: ['task', 'plan'].includes(kind) ? 'build' : kind, pluginDir, stallGuard: stallGuardOn(kind) }), {
      cwd: root, env: childEnv(pin, provider, kind === 'task' && task !== null ? handoffFile(task) : null), prompt, log, timeoutMs, refuseInit: (init) => exoError(init, PLUGIN_ROOT)
    });
    const parsed = parseStream(outcome.text);
    spent += parsed.cost;
    appendLog(ledgerFile, `${JSON.stringify({ kind, task, sessionId: parsed.sessionId, costUsd: parsed.cost, hooks: parsed.hooks })}\n`);
    return { before, outcome, parsed: { ...parsed, model: parsed.model ?? sessionModel } };
  };

  const landedStats = [];
  let stall = 0;
  let retryNote = '';
  let iteration = 0;
  let stop;
  let lastTask = null;
  const untrackedAtStart = new Set(untrackedPaths(root));
  const app = frameOf(plan.frame).app;
  const appLog = path.join(logDir, 'app.log');
  const appDeadlineMs = environmentMs('EXO_APP_READY_MS', 120_000);
  let appHandle = null;
  let appIsReady = false;
  const ensureApp = async () => {
    if (app === null || (appIsReady && !appHandle.exited())) return true;
    if (appHandle === null || appHandle.exited()) {
      say(`app start: ${clip(app.start, 80)}`);
      appHandle = startDetached(app.start, { cwd: root, env: withoutRunVariables(), log: appLog });
      appPid = appHandle.pid ?? null;
    }
    appIsReady = app.ready !== null && await waitForUrl(app.ready, { deadlineMs: appDeadlineMs, app: appHandle });
    if (appIsReady) say(`app ready: ${app.ready}`);
    return appIsReady;
  };
  const appTail = () => clip(lastLine(isFileOnDisk(appLog) ? fs.readFileSync(appLog, 'utf8') : '') || 'empty', 80);
  const takeParked = (name) => {
    const file = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'parked') : null;
    if (file === null || !fs.existsSync(file)) return null;
    const line = fs.readFileSync(file, 'utf8').trim();
    if (!line.startsWith(`Task ${name}: PARKED`)) return null;
    fs.rmSync(file, { force: true });
    return line.replace(/^Task \S+: PARKED\s*/, '');
  };
  const parkedStop = (line, log) => ({ line: `parked: ${line}`, why: `The run is parked: ${clip(line, 100)}`, next: `run exo approve for the open gate (see ${log}), then run exo run again`, parked: true });
  const unsafeStop = (n, before, trailer, parsed, log) => {
    const breach = planBreach() ?? breachOf(root, before, { trailer });
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
  };
  const blockedStop = (n, reason) => {
    say(`task ${n} blocked: ${clip(reason, 80)}`);
    return { line: `task ${n} blocked: ${reason}; re-plan with exo:spec`, why: `Task ${n} is blocked: ${clip(reason, 100)}`, next: 're-plan with /exo:spec, then run exo run again' };
  };
  const markLanded = (n, record, startedTask) => {
    stall = 0;
    retryNote = '';
    run.landings.set(n, { sha: gitOut(root, ['rev-parse', '--short=12', 'HEAD']), record });
    passes.add(n);
    fs.rmSync(handoffFile(n), { force: true });
    writeTasks();
    const ms = Date.now() - startedTask;
    landedStats.push({ ms, turns: record.turns, tokens: record.tokens, cost: record.cost });
    say(landedLine({ number: n, sha: run.landings.get(n).sha, ms, turns: record.turns, tokens: record.tokens, cost: record.cost }));
    noteTask({ n, subject: taskSubject(plan.tasks.find((entry) => entry.number === n).title), landed: passes.size, total: plan.tasks.length });
    for (const line of (gitOut(root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean)) {
      const file = line.slice(3);
      if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
    }
  };
  const landByScript = (n) => {
    const log = path.join(logDir, `land-task-${n}.log`);
    const answer = spawnSync(process.execPath, [SCRIPT.landTask, '--plan', planPath, '--task', String(n), '--root', root], {
      cwd: root, env: { ...process.env, EXO_RUN_TASK: `${planId}/${n}` }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs
    });
    const output = `${answer.stdout ?? ''}${answer.stderr ?? ''}`;
    appendLog(log, output, fs.writeFileSync);
    return { landed: answer.status === 0 && landedTasks(plan.tasks, root, planId).includes(n), output, log };
  };
  const landInOrder = (numbers, record, started) => {
    for (const n of numbers) {
      const attempt = landedTasks(plan.tasks, root, planId).includes(n) ? { landed: true } : landByScript(n);
      if (attempt.landed) {
        markLanded(n, record, started);
        continue;
      }
      say(`task ${n} not landed by the script: ${clip(lastLine(attempt.output), 80)}`);
      retryNote = `\nThe previous attempt did not land task ${n}. Its last result line: ${lastLine(attempt.output)}\nIts log: ${attempt.log}`;
      return;
    }
  };
  if (stop === undefined && chosen.mode === 'plan' && order.length > 0) {
    stop = budgetStop() ?? undefined;
    const first = order[0];
    if (stop === undefined) {
      iteration += 1;
      const startedPlan = Date.now();
      const untrackedBefore = new Set(untrackedPaths(root));
      say(`plan session start: tasks ${numbersText(order)}`);
      const log = path.join(logDir, `iter-${iteration}-plan.log`);
      const { before, outcome, parsed } = await spawnOne({ prompt: planPrompt({ plan, planPath, numbers: order, root }), allow: taskAllow, settings: taskSettings, pin: `${planId}/${first}`, log, kind: 'plan', task: first });
      const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
      const record = { iteration, task: first, log, turns: parsed.turns, tokens: parsed.tokens, cost: parsed.cost, peakContext: parsed.peakContext, last, ...deniedFields(parsed) };
      run.records.push(record);
      lastTask = first;
      if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
      stop = unsafeStop(first, before, planTaskTrailer(planId, first), parsed, log) ?? undefined;
      const status = outcome.timedOut ? null : last.match(/^Task \d+: (?:BLOCKED|PLAN DRIFT)\b\s*(.*)$/);
      if (stop === undefined && status !== null) stop = blockedStop(first, status[1] || last);
      landInOrder(stop === undefined ? order : [], record, startedPlan);
      if (stop === undefined && landedTasks(plan.tasks, root, planId).length < plan.tasks.length) {
        const { patch, failed } = shelveLeftover(root, path.join(logDir, `plan-leftover-${iteration}.patch`), untrackedBefore);
        if (patch !== null) say(`plan session leftover saved to ${patch}`);
        if (failed !== undefined) {
          say(`plan session leftover not cleared: ${clip(failed, 80)}`);
          lastTask = null;
          stop = { line: `plan session leftover not cleared: ${failed}`, why: 'The plan session left changes the script could not clear', next: `${patch === null ? 'commit or remove the leftover (git status)' : `the leftover is in ${patch}; restore the tree to HEAD`}, then run exo run again` };
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
      stop = { line: `no ready task: tasks ${waiting.join(', ')} wait on unlanded dependencies`, why: 'They wait on tasks that have not landed', next: 'check the Depends on lines in the plan, then run exo run again' };
      break;
    }
    if (iteration >= cap) {
      stop = { line: `iteration cap ${cap} reached, ${landed.length}/${plan.tasks.length} landed`, why: `The run hit its limit of ${cap} sessions`, next: 'run exo run again to continue, or raise --max-iterations' };
      break;
    }
    stop = budgetStop() ?? undefined;
    if (stop !== undefined) break;
    iteration += 1;
    const n = task.number;
    const startedTask = Date.now();
    say(`${startLine({ number: n, subject: taskSubject(task.title), model, effort })}${retryNote === '' ? '' : ` (try ${stall + 1})`}`);
    noteTask({ n, subject: taskSubject(task.title), landed: landed.length, total: plan.tasks.length });
    const log = path.join(logDir, `iter-${iteration}-task-${n}.log`);
    const trailer = planTaskTrailer(planId, n);
    const { before, outcome, parsed } = await spawnOne({ prompt: buildPrompt(n, retryNote + handoffNote(n)), allow: taskAllow, settings: taskSettings, pin: `${planId}/${n}`, log, task: n });
    const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
    const record = { iteration, task: n, log, turns: parsed.turns, tokens: parsed.tokens, cost: parsed.cost, peakContext: parsed.peakContext, last, ...deniedFields(parsed) };
    run.records.push(record);
    lastTask = n;

    const markerFile = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'blocked') : null;
    const marker = markerFile !== null && fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : null;
    if (markerFile !== null) fs.rmSync(markerFile, { force: true });

    stop = unsafeStop(n, before, trailer, parsed, log) ?? undefined;
    if (stop !== undefined) break;
    if (landedTasks(plan.tasks, root, planId).includes(n)) {
      markLanded(n, record, startedTask);
      continue;
    }
    if (!outcome.timedOut && new RegExp(`^Task ${n}: HANDOFF\\b`).test(last) && isFileOnDisk(handoffFile(n))) {
      say(`task ${n} handed off at the context limit`);
      retryNote = '';
      continue;
    }
    const statusLine = new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`);
    const blocked = marker?.match(statusLine) ?? (outcome.timedOut ? null : last.match(statusLine));
    if (blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'))) {
      const rescue = blocked !== null && !outcome.timedOut && parsed.denials.length > 0 ? landByScript(n) : null;
      if (rescue?.landed) {
        markLanded(n, record, startedTask);
        continue;
      }
      stop = blockedStop(n, blocked?.[1] || last);
      break;
    }
    const attempt = outcome.timedOut ? null : landByScript(n);
    if (attempt?.landed) {
      markLanded(n, record, startedTask);
      continue;
    }
    const failure = attempt === null ? last : lastLine(attempt.output);
    retryNote = attempt === null
      ? `\nThe previous attempt did not land task ${n}. Its last result line: ${last}\nIts log: ${log}`
      : `\nThe previous attempt did not land task ${n}. Its last result line: ${last}\nThe script's proof and land output ended: ${failure}\nIts log: ${attempt.log}`;
    stall += 1;
    say(`task ${n} failed: ${outcome.timedOut ? failure : clip(failure, 80)}`);
    if (stall >= STALL_LIMIT) {
      stop = { line: `no progress on task ${n} in ${STALL_LIMIT} iterations, log ${log}`, why: `Task ${n} did not land in ${STALL_LIMIT} tries`, next: fix(log) };
      break;
    }
  }

  if (stop !== undefined && !stop.parked && !stop.breach && lastTask !== null) {
    const { patch, failed } = shelveLeftover(root, path.join(logDir, `task-${lastTask}-leftover.patch`), untrackedAtStart);
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
  if (stop === undefined) stop = budgetStop() ?? undefined;
  if (stop === undefined && !(await ensureApp())) {
    say('app not ready');
    stop = { line: `app not ready: ${app.ready ?? 'no Ready: url'} did not answer within ${Math.round(appDeadlineMs / 1000)} s, app log ends: ${appTail()}`, why: 'The plan App did not become ready', next: `check the App: start command and Ready: url in the plan and ${appLog}, then run exo run again` };
  }
  if (stop === undefined) {
    setPhase('verify');
    const base = defaultBranch(root);
    let sessions = 0;
    const runSession = async ({ kind, task = null, model: asked = null, prompt }) => {
      const budget = budgetStop();
      if (budget !== null) return { stop: { ...budget, gate: 'FAIL' } };
      sessions += 1;
      iteration += 1;
      const number = iteration;
      const log = path.join(logDir, `tail-${sessions}-${kind}.log`);
      const sessionModel = asked !== null && provider.name === 'claude' ? asked : model;
      const { before, outcome, parsed } = await spawnOne({ prompt, allow: tailAllow, settings: tailSettings, pin: null, log, kind, task, sessionModel });
      const last = outcome.timedOut ? 'timed out' : lastLine(parsed.resultText);
      run.records.push({ iteration: number, task: null, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last, denied: [], refused: [] });
      const breach = planBreach() ?? breachOf(root, before, { tail: true });
      const parked = breach === null ? takeParked('tail') : null;
      const notLoaded = breach === null && parked === null ? exoError(parsed.init, PLUGIN_ROOT) : null;
      if (breach !== null) return { stop: { line: `breach in iteration ${number}: ${breach}`, why: `The final review or fix session breached a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, then run exo run again`, gate: 'FAIL' } };
      if (parked !== null) return { stop: { ...parkedStop(parked, log), gate: 'FAIL' } };
      if (notLoaded !== null) return { stop: { line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again', gate: 'FAIL' } };
      return { resultText: outcome.timedOut ? '' : parsed.resultText };
    };
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
        const session = await runSession({ kind: 'fix', prompt: `The Success criterion \`${command}\` must fail on the run's start commit ${startCommit.slice(0, 12)} (with the tests of this run laid over it) and pass on the head. The check found:\n${result.lines.join('\n')}\n\nChange the tests or the product so the command proves the work, commit it, and end on one line.` });
        if (session.stop !== undefined) return session.stop;
        result = evaluate();
      }
      run.redGreenLine = result.outcome === 'proved' ? 'Red-green: proved' : `Red-green: ${result.outcome}: ${result.lines[0]}`;
      say(run.redGreenLine);
      return result.outcome === 'proved' ? null : { line: `red-green: ${result.outcome}: ${result.lines[0]}`, why: `The Success criterion is not proved red-green (${clip(result.lines[0], 80)})`, next: 'fix the Success criterion or add Red: none (<reason>), then run exo run again', gate: 'FAIL' };
    };
    const gateStop = await successGate();
    if (gateStop === null) say('all tasks landed, final review start');
    const tail = gateStop === null ? await runTail({ planPath, plan, root, base, branch, runSession, say }) : { stop: gateStop };
    if (tail.stop !== undefined) stop = { gate: 'FAIL', ...tail.stop };
    else {
      const gate = tail.gate;
      run.verifyLines = `${gate.stdout ?? ''}`.split('\n').filter((line) => /^(FAIL|STRAY|WARN)\b/.test(line));
      const pass = gate.status === 0;
      const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
      const land = process.env.EXO_RUN_DIR ? frameOf(plan.frame).land : null;
      stop = {
        line: `done, ${plan.tasks.length}/${plan.tasks.length} tasks landed, gate ${pass ? 'PASS' : 'FAIL'}`,
        gate: pass ? 'PASS' : 'FAIL',
        next: pass
          ? `${land === null ? `review branch ${branch}, then push it or open a pull request` : `exo run lands branch ${branch} per Land: ${land}`}${manual > 0 ? `; ${manual} manual check${manual === 1 ? '' : 's'} are listed in the detail file` : ''}`
          : `read the failing lines in the detail file, fix them on ${branch}, then run exo run again`
      };
      if (pass) exitCode = 0;
    }
  }
  if (stop?.parked) exitCode = 3;
  // why: after a pass exo-cli still lands the branch and owns the final phase, so a pass records only the reason.
  const stopPhase = STOP_PHASE[exitCode] ?? 'stopped';
  noteStop(exitCode === 0 ? { reason: stop.line } : { phase: stopPhase, reason: stop.line });
  for (const line of averageLines(landedStats)) say(line);
  say(exitCode === 0 ? 'run done' : `run stopped: ${stop.why ?? 'final check failed'}`);
  if (exitCode === 0) appendLog(progressFile, 'RUN COMPLETE\n');

  appendLog(path.join(logDir, 'summary.txt'), `${detailLines(run, stop).join('\n')}\n`, fs.writeFileSync);
  const refused = deniedLines(run.records);
  if (process.env.EXO_RUN_DIR && refused.length > 0) appendLog(path.join(process.env.EXO_RUN_DIR, 'denied.txt'), `${refused.join('\n')}\n`);
  process.stdout.write(`${summaryLines(run, stop).join('\n')}\n`);
  return exitCode;
}

async function entry(argv) {
  try {
    return await main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`run-plan: ${error.message}\n`);
    return 2;
  } finally {
    if (appPid !== null) killTree(appPid);
  }
}

if (isMain(import.meta.url)) process.exitCode = await entry(process.argv.slice(2));
