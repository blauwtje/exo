#!/usr/bin/env node
// Runs a plan unattended: each unlanded task in a fresh headless `claude -p`
// process, the script picking the task and checking git after each process,
// then one verify process and verify.mjs itself, ending on one stop line.
//
//   node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
//     [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--claude <path>] [--dry-run]
//
// Held to one task by code: the script names task n on stdin and in
// EXO_RUN_TASK, which land-task's pin enforces; every spawn runs under
// `--permission-mode dontAsk` with an allowlist built from the plan and a deny
// list for history and remote writes and raw `git commit`, so land-task is the
// only committer. After each process, HEAD may hold no new commit or one whose
// parent is the old HEAD and whose only Plan-task trailer names n; the branch
// and every `refs/remotes/*` ref must not move. Anything else stops as a
// breach, and the script undoes nothing. A push to a path or URL moves no
// `refs/remotes/*` ref, so the ref check misses it: the deny list and
// dontAsk's no-rule-no-run are the guard against it.
//
// Exits 0 on done with gate PASS, 1 on any other stop, 2 on a refusal or bad
// arguments. Logs, summary.txt, tasks.json ([{ number, title, passes }], a task
// flipped after its landing) and progress.md (ending on RUN COMPLETE when the
// gate passes) go to .exo/run-plan/<plan-id>/<UTC time>/.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, frameOf, landedTasks, loopCommands, parsePlan, planIdOf, planTaskTrailer, readyTasks, taskCommits } from '#plan-tasks';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';

const KILL_GRACE_MS = 5000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  nextTask: path.join(HERE, 'next-task.mjs'),
  landTask: path.join(HERE, 'land-task.mjs'),
  verify: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'run-probes.mjs'),
  planCheck: path.join(PLUGIN_ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs'),
  mcpToolCall: path.join(PLUGIN_ROOT, 'lib', 'mcp-tool-call.mjs')
};

// The markers a running Claude Code session sets; any other CLAUDE_CODE_*
// passes through, since a user may export provider settings in the shell.
const SESSION_MARKERS = [
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID'
];

const DENY_RULES = [
  'Bash(git push *)', 'Bash(gh *)', 'Bash(git reset *)', 'Bash(git rebase *)', 'Bash(git cherry-pick *)',
  'Bash(git merge *)', 'Bash(git tag *)', 'Bash(git switch *)', 'Bash(git checkout *)', 'Bash(git branch -D *)',
  'Bash(git commit *)', 'Bash(node *settings.mjs*)', 'Bash(node *memory.mjs*)'
];

const READ_ONLY_GIT = ['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files'];
const STALL_LIMIT = 2;
const DEFAULT_TIMEOUT_MINUTES = 60;

class Refusal extends Error {}

const isFileOnDisk = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * How to start claude without a shell: `{ command, prefix }`, or `{ refused }`.
 * `flag` is `--claude`; a `.mjs` path runs as `node <path>`. Else PATH is
 * searched for `claude.exe` on Windows and `claude` elsewhere; a PATH holding
 * only `claude.cmd` refuses, since Node runs a `.cmd` only through a shell.
 */
export function resolveClaude({ flag, pathValue = process.env.PATH ?? '', platform = process.platform, isFile = isFileOnDisk } = {}) {
  if (flag !== undefined) {
    const file = path.resolve(flag);
    if (!isFile(file)) return { refused: `no claude at ${flag}; pass --claude <path>` };
    return file.endsWith('.mjs') ? { command: process.execPath, prefix: [file] } : { command: file, prefix: [] };
  }
  const windows = platform === 'win32';
  const join = windows ? path.win32.join : path.posix.join;
  const directories = pathValue.split(windows ? ';' : ':').filter((entry) => entry !== '');
  const found = directories.map((directory) => join(directory, windows ? 'claude.exe' : 'claude')).find(isFile);
  if (found !== undefined) return { command: found, prefix: [] };
  if (directories.some((directory) => isFile(join(directory, 'claude.cmd')))) {
    return { refused: 'PATH holds only claude.cmd, which Node runs only through a shell; pass --claude <path>' };
  }
  return { refused: 'no claude on PATH; pass --claude <path>' };
}

/**
 * The parts of one `claude -p --output-format stream-json --verbose` stream the
 * runner reads: the first init event, the last result's text and subtype, the
 * turns summed over every result, the last reported cost and the denials
 * unioned by tool_use_id, because a background agent adds a second result.
 */
export function parseStream(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event !== null && typeof event === 'object') events.push(event);
    } catch {
      // A line that is not JSON, such as stderr, is only logged.
    }
  }
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? null;
  const results = events.filter((event) => event.type === 'result');
  const final = results.at(-1) ?? null;
  const denials = new Map();
  for (const result of results) {
    for (const denial of result.permission_denials ?? []) {
      if (!denials.has(denial.tool_use_id)) denials.set(denial.tool_use_id, denial);
    }
  }
  const costs = results.map((result) => result.total_cost_usd).filter((cost) => typeof cost === 'number');
  return {
    init,
    final,
    resultText: typeof final?.result === 'string' ? final.result : '',
    turns: results.reduce((sum, result) => sum + (Number(result.num_turns) || 0), 0),
    cost: costs.at(-1) ?? 0,
    denials: [...denials.values()]
  };
}

const realpathOr = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

/** Why exo did not load in this process, read from its first init event; null when it loaded or no init came. */
function exoError(init, pluginRoot) {
  if (init === null) return null;
  const error = (init.plugin_errors ?? []).find((entry) => /^exo(@|$)/.test(String(entry.plugin ?? '')));
  if (error !== undefined) return error.message ?? error.type ?? 'plugin error';
  const entry = (init.plugins ?? []).find((plugin) => plugin.name === 'exo');
  if (entry === undefined) return 'no exo plugin in the init event';
  if (realpathOr(entry.path) !== realpathOr(pluginRoot)) return `exo loads from ${entry.path}, not ${pluginRoot}`;
  return null;
}

/** A path as given and as its realpath, when the two differ. */
const spellings = (file) => [...new Set([file, realpathOr(file)])];
const pathRule = (tool, directory) => spellings(directory).map((spelling) => `${tool}(/${spelling.split(path.sep).join('/')}/**)`);
const scriptRules = (files) => files.flatMap((file) => spellings(file).flatMap((spelling) => [`Bash(node "${spelling}" *)`, `Bash(node ${spelling} *)`]));

/** The allowlist one process gets: reads, edits in the root, exo's scripts, the plan's commands and read-only git. */
export function allowRules({ root, planPath, plan, tail = false, pluginRoot = PLUGIN_ROOT }) {
  const scripts = tail ? [SCRIPT.verify, SCRIPT.runProbes, SCRIPT.landTask] : [SCRIPT.nextTask, SCRIPT.landTask, SCRIPT.mcpToolCall];
  const commands = loopCommands(plan)
    .filter((entry) => entry.field !== 'Success criterion')
    .flatMap((entry) => entry.parts.map((part) => `Bash(${part} *)`));
  return [...new Set([
    ...[root, pluginRoot, path.dirname(planPath)].flatMap((directory) => pathRule('Read', directory)),
    ...pathRule('Edit', root),
    ...pathRule('Write', root),
    ...scriptRules(scripts),
    ...commands,
    ...READ_ONLY_GIT.map((command) => `Bash(git ${command} *)`)
  ])];
}

function claudeArgs({ model, effort, budget, allow }) {
  return [
    '-p', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--output-format', 'stream-json', '--verbose', '--model', model, '--effort', effort,
    ...(budget === undefined ? [] : ['--max-budget-usd', budget]),
    '--allowedTools', ...allow,
    '--disallowedTools', ...DENY_RULES
  ];
}

function childEnv(pin) {
  const env = { ...process.env };
  for (const name of SESSION_MARKERS) delete env[name];
  delete env.EXO_RUN_TASK;
  if (pin !== null) env.EXO_RUN_TASK = pin;
  return env;
}

/** Model and effort from build-task's frontmatter, read at start rather than hard-coded. */
function buildTaskDefaults() {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'build-task.md'), 'utf8');
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return {
    model: frontmatter.match(/^model: *(.+)$/m)?.[1].trim() ?? 'sonnet',
    effort: frontmatter.match(/^effort: *(.+)$/m)?.[1].trim() ?? 'high'
  };
}

function gitOut(root, args, { trim = true } = {}) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (answer.status !== 0) return null;
  return trim ? answer.stdout.trim() : answer.stdout.replace(/\s+$/, '');
}

function snapshot(root) {
  return {
    head: gitOut(root, ['rev-parse', 'HEAD']),
    branch: gitOut(root, ['symbolic-ref', '-q', 'HEAD']),
    remotes: gitOut(root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes'])
  };
}

const planTaskLines = (root, sha) => (gitOut(root, ['log', '-1', '--format=%B', sha]) ?? '').split('\n').filter((line) => /^Plan-task: /.test(line));

/** The breach a process left, or null: a task allows one commit carrying only its own trailer, the tail any commits with none. */
function breachOf(root, before, { trailer = null } = {}) {
  const after = snapshot(root);
  if (after.remotes !== before.remotes) return 'remote ref moved';
  if (after.branch !== before.branch) return 'branch moved';
  if (after.head === before.head) return null;
  if (spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', before.head, after.head]).status !== 0) return 'branch moved';
  const commits = (gitOut(root, ['rev-list', `${before.head}..${after.head}`]) ?? '').split('\n').filter(Boolean);
  if (trailer === null) return commits.some((sha) => planTaskLines(root, sha).length > 0) ? 'extra commit' : null;
  if (commits.length !== 1) return 'extra commit';
  const parent = gitOut(root, ['rev-parse', `${commits[0]}^`]);
  const lines = planTaskLines(root, commits[0]);
  return parent === before.head && lines.length === 1 && lines[0] === trailer ? null : 'extra commit';
}

/** Spawn claude with the prompt on stdin and its output in `log`; kill it at the timeout. */
function spawnClaude(claude, args, { cwd, env, prompt, log, timeoutMs }) {
  return new Promise((resolve) => {
    let text = '';
    let timedOut = false;
    let settled = false;
    let graceTimer = null;
    // Detached on POSIX so the child leads a process group the timeout can end whole.
    const child = spawn(claude.command, [...claude.prefix, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const endTree = (signal) => {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        else process.kill(-child.pid, signal);
      } catch {
        // The group is already gone.
      }
    };
    // The child has its own process group, so a signal to the runner no longer reaches it: end the group, then exit.
    const onSignal = (signal) => {
      endTree('SIGKILL');
      process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      resolve({ text, code, signal, timedOut });
    };
    const record = (chunk) => {
      text += chunk;
      fs.appendFileSync(log, chunk);
    };
    child.stdout.setEncoding('utf8').on('data', record);
    child.stderr.setEncoding('utf8').on('data', record);
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.on('error', (error) => {
      record(`run-plan: spawn failed: ${error.message}\n`);
      settle(null, null);
    });
    // After a kill a grandchild may still hold the pipes, so settle on exit, not close.
    child.on('exit', (code, signal) => {
      if (!timedOut) return;
      endTree('SIGKILL');
      settle(code, signal);
    });
    child.on('close', settle);
    const timer = setTimeout(() => {
      timedOut = true;
      endTree('SIGTERM');
      // A claude that ignores SIGTERM never exits, so end the group hard after a grace period.
      graceTimer = setTimeout(() => {
        endTree('SIGKILL');
        settle(null, 'SIGKILL');
      }, KILL_GRACE_MS);
    }, timeoutMs);
  });
}

const lastLine = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';

/** The tasks in the order the runner would take them, each the first ready one after the ones before it land. */
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
  if (branch !== wanted) throw new Refusal(`the checkout is on branch ${branch ?? '(detached)'}, not the plan's Branch: ${wanted}`);
  if (wanted === defaultBranch(root)) throw new Refusal(`Branch: ${wanted} is the default branch`);
  const tracked = gitOut(root, ['status', '--porcelain', '--untracked-files=no'], { trim: false });
  if (tracked !== '') throw new Refusal(`tracked change in the checkout: ${tracked.split('\n')[0].slice(3)}; commit it first`);
  const check = spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', planPath, '--root', root, '--loop'], { encoding: 'utf8' });
  if (check.status !== 0) {
    const lines = `${check.stdout}\n${check.stderr}`.split('\n').filter((line) => line.trim() !== '');
    throw new Refusal(`plan-check --loop fails: ${lines.find((line) => line.startsWith('loop: ')) ?? lines[0] ?? `exit ${check.status}`}`);
  }
  return { claude, planPath, root, plan, branch };
}

function reportLines(root, number) {
  const file = path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`);
  if (!isFileOnDisk(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return ['Unresolved', 'Decision'].flatMap((label) => {
    const line = lines.find((entry) => new RegExp(`^(?:- )?${label}:`).test(entry));
    return line === undefined ? [] : [`Task ${number} ${line.replace(/^- /, '')}`];
  });
}

const money = (cost) => `$${cost.toFixed(4)}`;

function summaryLines(run, stop) {
  const { planPath, plan, branch, cap, records, landings, logDir, root } = run;
  const lines = [`Plan: ${planPath}`, `Branch: ${branch}`, `Iterations: ${records.filter((record) => record.task !== null).length} of ${cap}`, `Logs: ${logDir}`];
  for (const task of plan.tasks) {
    const landing = landings.get(task.number);
    if (landing === undefined) lines.push(`Task ${task.number}: not landed`);
    else if (landing.before) lines.push(`Task ${task.number}: ${landing.sha} landed before the run`);
    else lines.push(`Task ${task.number}: ${landing.sha} iteration ${landing.record.iteration}, turns ${landing.record.turns}, cost ${money(landing.record.cost)} (reported)`);
  }
  lines.push(`Total cost: ${money(records.reduce((sum, record) => sum + record.cost, 0))} (reported)`);
  const tail = records.find((record) => record.task === null);
  if (tail !== undefined) lines.push(`Tail: ${tail.log}, turns ${tail.turns}, last line: ${tail.last || '(none)'}`);
  for (const record of records) for (const command of record.denied) lines.push(`Denied in iteration ${record.iteration}, task ${record.task}: ${command}; add it to Allow: if the task needs it`);
  lines.push(...run.verifyLines);
  for (const [number, landing] of landings) if (!landing.before) lines.push(...reportLines(root, number));
  if (run.uncommitted.size > 0) lines.push(`Uncommitted after a landing: ${[...run.uncommitted].join(', ')}`);
  const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- '));
  if (manual.length > 0) lines.push('Manual checks:', ...manual);
  lines.push(stop);
  return lines;
}

function numberFlag(value, name, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new UsageError(`flag '--${name}' needs a positive ${integer ? 'integer' : 'number'}`);
  return number;
}

async function main(argv) {
  const [planArgument, ...rest] = argv;
  if (planArgument === undefined || planArgument.startsWith('--')) throw new UsageError('the first argument names the plan file');
  const flags = parseFlags(rest, {
    root: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
    'max-budget-usd': 'value', claude: 'value', 'dry-run': 'boolean'
  });
  const maxIterations = numberFlag(flags['max-iterations'], 'max-iterations', { integer: true });
  const timeoutMs = (numberFlag(flags.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES) * 60_000;
  if (flags['max-budget-usd'] !== undefined) numberFlag(flags['max-budget-usd'], 'max-budget-usd');

  let context;
  try {
    context = preflight(planArgument, flags);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { claude, planPath, root, plan, branch } = context;
  const defaults = buildTaskDefaults();
  const model = flags.model ?? defaults.model;
  const effort = flags.effort ?? defaults.effort;
  const planId = planIdOf(planPath);
  const landedAtStart = landedTasks(plan.tasks, root, planId);
  const cap = maxIterations ?? 2 * (plan.tasks.length - landedAtStart.length);
  const taskAllow = allowRules({ root, planPath, plan });
  const tailAllow = allowRules({ root, planPath, plan, tail: true });
  const buildPrompt = (number) => `/exo:build ${planPath} --task ${number}`;

  if (flags['dry-run']) {
    const order = taskOrder(plan.tasks, landedAtStart);
    const first = order[0];
    process.stdout.write([
      `Order: ${order.length === 0 ? 'every task has landed' : order.map((number) => `Task ${number}`).join(', ')}`,
      `Spawn: ${[claude.command, ...claude.prefix].join(' ')} ${claudeArgs({ model, effort, budget: flags['max-budget-usd'], allow: ['<allow>'] }).join(' ')}`,
      'Allow:', ...taskAllow.map((rule) => `  ${rule}`),
      'Allow in the tail:', ...tailAllow.filter((rule) => !taskAllow.includes(rule)).map((rule) => `  ${rule}`),
      'Deny:', ...DENY_RULES.map((rule) => `  ${rule}`),
      `First prompt: ${first === undefined ? `/exo:verify ${planPath} Push nothing and open no pull request.` : buildPrompt(first)}`,
      ''
    ].join('\n'));
    return 0;
  }

  try {
    excludeScratch(root);
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
    process.stdout.write(`run-plan: refused: scratch-exclude: ${error.message}\n`);
    return 2;
  }
  const logDir = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, utcStamp());
  fs.mkdirSync(logDir, { recursive: true });
  const run = { planPath, plan, branch, cap, root, logDir, records: [], landings: new Map(), uncommitted: new Set(), verifyLines: [] };
  for (const number of landedAtStart) {
    const task = plan.tasks.find((entry) => entry.number === number);
    run.landings.set(number, { before: true, sha: (taskCommits(task, root, planId)[0] ?? '').slice(0, 12) });
  }

  const tasksFile = path.join(logDir, 'tasks.json');
  const progressFile = path.join(logDir, 'progress.md');
  const passes = new Set(landedAtStart);
  const writeTasks = () => fs.writeFileSync(tasksFile, `${JSON.stringify(plan.tasks.map((task) => ({ number: task.number, title: task.title, passes: passes.has(task.number) })), null, 2)}\n`);
  const progress = (line) => fs.appendFileSync(progressFile, `${line}\n`);
  writeTasks();
  fs.writeFileSync(progressFile, `# Progress\n\nPlan: ${planPath}\nBranch: ${branch}\n\n`);

  const spawnOne = async ({ prompt, allow, pin, log }) => {
    const before = snapshot(root);
    const outcome = await spawnClaude(claude, claudeArgs({ model, effort, budget: flags['max-budget-usd'], allow }), {
      cwd: root, env: childEnv(pin), prompt, log, timeoutMs
    });
    return { before, outcome, parsed: parseStream(outcome.text) };
  };

  let stall = 0;
  let retryNote = '';
  let iteration = 0;
  let stop;
  for (;;) {
    const landed = landedTasks(plan.tasks, root, planId);
    if (landed.length === plan.tasks.length) break;
    const task = readyTasks(plan.tasks, landed)[0];
    if (task === undefined) {
      stop = `no ready task: tasks ${plan.tasks.filter((entry) => !landed.includes(entry.number)).map((entry) => entry.number).join(', ')} wait on unlanded dependencies`;
      break;
    }
    if (iteration >= cap) {
      stop = `iteration cap ${cap} reached, ${landed.length}/${plan.tasks.length} landed`;
      break;
    }
    iteration += 1;
    const n = task.number;
    const log = path.join(logDir, `iter-${iteration}-task-${n}.log`);
    const trailer = planTaskTrailer(planId, n);
    const { before, outcome, parsed } = await spawnOne({ prompt: buildPrompt(n) + retryNote, allow: taskAllow, pin: `${planId}/${n}`, log });
    const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
    // A denial is only logged: the task is judged by whether it landed, and a run that landed nothing counts toward the stall limit.
    const denied = parsed.denials.map((denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`);
    const record = { iteration, task: n, log, turns: parsed.turns, cost: parsed.cost, last, denied };
    run.records.push(record);

    const breach = breachOf(root, before, { trailer });
    if (breach !== null) {
      stop = `breach in iteration ${iteration}: ${breach}`;
      break;
    }
    const notLoaded = exoError(parsed.init, PLUGIN_ROOT);
    if (notLoaded !== null) {
      stop = `exo not loaded: ${notLoaded}`;
      break;
    }
    if (landedTasks(plan.tasks, root, planId).includes(n)) {
      stall = 0;
      retryNote = '';
      run.landings.set(n, { sha: gitOut(root, ['rev-parse', '--short=12', 'HEAD']), record });
      passes.add(n);
      writeTasks();
      progress(`- Task ${n}: landed ${run.landings.get(n).sha}, iteration ${iteration}`);
      for (const line of (gitOut(root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean)) {
        const file = line.slice(3);
        if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
      }
      continue;
    }
    const blocked = outcome.timedOut ? null : last.match(new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`));
    if (blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'))) {
      stop = `task ${n} blocked: ${blocked?.[1] || last}; re-plan with exo:spec`;
      break;
    }
    stall += 1;
    if (stall >= STALL_LIMIT) {
      stop = `no progress on task ${n} in ${STALL_LIMIT} iterations, log ${log}`;
      break;
    }
    retryNote = `\nThe previous attempt did not land task ${n}. Its last result line: ${last}\nIts log: ${log}`;
  }

  let exitCode = 1;
  if (stop === undefined) {
    iteration += 1;
    const log = path.join(logDir, 'tail.log');
    const { before, outcome, parsed } = await spawnOne({ prompt: `/exo:verify ${planPath} Push nothing and open no pull request.`, allow: tailAllow, pin: null, log });
    run.records.push({ iteration, task: null, log, turns: parsed.turns, cost: parsed.cost, last: outcome.timedOut ? 'timed out' : lastLine(parsed.resultText), denied: [] });
    const breach = breachOf(root, before);
    const notLoaded = breach === null ? exoError(parsed.init, PLUGIN_ROOT) : null;
    if (breach !== null) stop = `breach in iteration ${iteration}: ${breach}`;
    else if (notLoaded !== null) stop = `exo not loaded: ${notLoaded}`;
    else {
      const base = defaultBranch(root);
      const gate = spawnSync(process.execPath, [SCRIPT.verify, '--plan', planPath, '--root', root, ...(base === null ? [] : ['--base', base])], {
        cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
      });
      run.verifyLines = `${gate.stdout ?? ''}`.split('\n').filter((line) => /^(FAIL|STRAY|WARN)\b/.test(line));
      const pass = gate.status === 0;
      stop = `done, ${plan.tasks.length}/${plan.tasks.length} tasks landed, gate ${pass ? 'PASS' : 'FAIL'}`;
      if (pass) exitCode = 0;
    }
  }
  if (exitCode === 0) progress('RUN COMPLETE');

  const lines = summaryLines(run, `run-plan: stop: ${stop}`);
  fs.writeFileSync(path.join(logDir, 'summary.txt'), `${lines.join('\n')}\n`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return exitCode;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`run-plan: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
