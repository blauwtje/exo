#!/usr/bin/env node
// Runs a plan unattended: each unlanded task in a fresh headless `claude -p`
// process, the script picking the task and checking git after each process,
// then one verify process and verify.mjs itself, ending on one stop line.
//
//   node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
//     [--provider <name>] [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--claude <path>] [--dry-run]
//
// Held to one task by code: the script names task n on stdin and in
// EXO_RUN_TASK, which land-task's pin enforces; every spawn runs under
// `--permission-mode dontAsk` with a deny list for history and remote writes
// and raw `git commit`, so land-task is the only committer. By default each
// spawn also runs in Claude Code's sandbox (`--settings`): Bash writes only
// inside the checkout, reaches only run.json's `sandbox.allowedDomains`, and
// runs with no allow rule; land-task (in the tail also verify.mjs and
// run-probes.mjs) is the one command excluded from it, since it runs the
// Proof and the Land gate. Those come from the plan, so the plan's hash is
// taken at start and checked after each process. Native Windows, or run.json
// `sandbox.enabled: false`, falls back to an allowlist built from the plan.
// After each process, HEAD may hold no new commit or one whose parent is the
// old HEAD and whose only Plan-task trailer names n; the branch, every
// `refs/remotes/*` ref and the plan must not change. Anything else stops as a
// breach, and the script undoes nothing. A push to a path or URL moves no
// `refs/remotes/*` ref, so the ref check misses it: the deny list, the
// sandbox's network block and dontAsk's no-rule-no-run are the guard.
//
// Exits 0 on done with gate PASS, 1 on any other stop, 2 on a refusal or bad
// arguments. Logs, summary.txt, tasks.json ([{ number, title, passes }], a task
// flipped after its landing) and progress.md (ending on RUN COMPLETE when the
// gate passes) go to .exo/run-plan/<plan-id>/<UTC time>/.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, driftOf, frameOf, landedTasks, loopCommands, parsePlan, planIdOf, planTaskTrailer, readyTasks, taskCommits } from '#plan-tasks';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';
import { taskBrief } from './next-task.mjs';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';

const KILL_GRACE_MS = 5000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  landTask: path.join(HERE, 'land-task.mjs'),
  verify: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'run-probes.mjs'),
  planCheck: path.join(PLUGIN_ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs')
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
  'Bash(git commit *)', 'Bash(git stash *)', 'Bash(git clean *)', 'Bash(git restore *)', 'Bash(node *settings.mjs*)', 'Bash(node *memory.mjs*)'
];

const READ_ONLY_GIT = ['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files'];
// Inspection only: no write or network command, so file contents cannot leave the machine; `sed -n`, not `sed`, which edits with -i.
const READ_ONLY_INSPECT = ['ls', 'cat', 'grep', 'head', 'tail', 'wc', 'sed -n'];
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
 * unioned by tool_use_id, because a background agent adds a second result,
 * and the peak context: the largest input an assistant event reports.
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
  const peakContext = Math.max(0, ...events.filter((event) => event.type === 'assistant').map((event) => {
    const usage = event.message?.usage ?? {};
    return (Number(usage.input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0);
  }));
  const costs = results.map((result) => result.total_cost_usd).filter((cost) => typeof cost === 'number');
  return {
    init,
    final,
    resultText: typeof final?.result === 'string' ? final.result : '',
    turns: results.reduce((sum, result) => sum + (Number(result.num_turns) || 0), 0),
    cost: costs.at(-1) ?? 0,
    peakContext,
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

/** exo's scripts that run outside the sandbox: they run the plan's Proof and gates, which fail inside it. */
const unsandboxedScripts = (tail) => (tail ? [SCRIPT.verify, SCRIPT.runProbes, SCRIPT.landTask] : [SCRIPT.landTask]);

/**
 * Whether this run's sessions use Claude Code's sandbox: `{ enabled: true, allowedDomains }`
 * or `{ enabled: false, reason }`. `config` is the loaded run config.
 */
export function sandboxMode(config, { platform = process.platform } = {}) {
  if (platform === 'win32') return { enabled: false, reason: 'native Windows has no sandbox' };
  const sandbox = config?.defaults?.sandbox ?? {};
  if (sandbox.enabled === false) return { enabled: false, reason: 'sandbox.enabled is false in run.json' };
  return { enabled: true, allowedDomains: Array.isArray(sandbox.allowedDomains) ? sandbox.allowedDomains.map(String) : [] };
}

/** The `--settings` object for one process, or null with the sandbox off. */
export function sandboxSettings(mode, { tail = false } = {}) {
  if (!mode.enabled) return null;
  const excludedCommands = [...new Set(unsandboxedScripts(tail).flatMap((file) => spellings(file).flatMap((spelling) => [`node "${spelling}"`, `node ${spelling}`])))];
  return {
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      excludedCommands,
      network: { allowedDomains: mode.allowedDomains }
    }
  };
}

/**
 * The allowlist one process gets: reads, edits in the root and exo's scripts; with the sandbox off
 * also the plan's commands, read-only git and inspection. Sandboxed Bash needs no rule, so with the
 * sandbox on only the scripts that run outside it get one.
 */
export function allowRules({ root, planPath, plan, tail = false, pluginRoot = PLUGIN_ROOT, sandbox = false }) {
  const paths = [
    ...[root, pluginRoot, path.dirname(planPath)].flatMap((directory) => pathRule('Read', directory)),
    ...pathRule('Edit', root),
    ...pathRule('Write', root)
  ];
  if (sandbox) return [...new Set([...paths, ...scriptRules(unsandboxedScripts(tail))])];
  const scripts = tail ? [SCRIPT.verify, SCRIPT.runProbes, SCRIPT.landTask] : [SCRIPT.landTask];
  const commands = loopCommands(plan)
    .filter((entry) => entry.field !== 'Success criterion')
    .flatMap((entry) => entry.parts.map((part) => `Bash(${part} *)`));
  return [...new Set([
    ...paths,
    ...scriptRules(scripts),
    ...commands,
    ...READ_ONLY_GIT.map((command) => `Bash(git ${command} *)`),
    ...READ_ONLY_INSPECT.flatMap((command) => [`Bash(${command})`, `Bash(${command} *)`])
  ])];
}

function claudeArgs({ model, effort, budget, allow, settings = null }) {
  return [
    '-p', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--output-format', 'stream-json', '--verbose', '--model', model, '--effort', effort,
    ...(budget === undefined ? [] : ['--max-budget-usd', budget]),
    ...(settings === null ? [] : ['--settings', typeof settings === 'string' ? settings : JSON.stringify(settings)]),
    // No MCP servers: a run session uses none, and each configured server adds its tool schemas to every turn.
    '--strict-mcp-config',
    '--allowedTools', ...allow,
    '--disallowedTools', ...DENY_RULES
  ];
}

/** A copy of the runner's env for one child: the provider's env and mapped effort on top, the task pin, the session markers removed, and no Anthropic key for another host. */
export function childEnv(pin, provider) {
  const env = { ...process.env };
  for (const name of SESSION_MARKERS) delete env[name];
  delete env.EXO_RUN_TASK;
  if (pin !== null) env.EXO_RUN_TASK = pin;
  if (provider.name !== 'claude') delete env.ANTHROPIC_API_KEY;
  return { ...env, ...provider.env, CLAUDE_CODE_EFFORT_LEVEL: provider.effort };
}

/** The provider for this run, or a Refusal: the catalog and run.json, keys.env, and `--provider`, `--effort` over the defaults. */
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
    // A variable whose catalog value names a key is shown, never printed.
    shown: Object.entries(provider.env).map(([variable, value]) => [variable, String(config.providers[name].env[variable]).includes('${') ? '<from keys.env>' : value]),
    contextBudget: config.defaults.contextBudget,
    sandbox: sandboxMode(config)
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

/**
 * Spawn claude with the prompt on stdin and its output in `log`; kill it at the timeout.
 * `refuseInit(init)` sees the first init event and returns a reason to kill the child at once, else null.
 */
function spawnClaude(claude, args, { cwd, env, prompt, log, timeoutMs, refuseInit = () => null }) {
  return new Promise((resolve) => {
    let text = '';
    let timedOut = false;
    let aborted = false;
    let initSeen = false;
    let partial = '';
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
      if (initSeen) return;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      const init = parseStream(lines.join('\n')).init;
      if (init === null) return;
      initSeen = true;
      if (refuseInit(init) !== null) {
        aborted = true;
        endTree('SIGKILL');
      }
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
      if (!timedOut && !aborted) return;
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
  if (branch !== wanted) {
    const exists = gitOut(root, ['show-ref', '--verify', '--quiet', `refs/heads/${wanted}`]) !== null;
    throw new Refusal(`the checkout is on branch ${branch ?? '(detached)'}, not the plan's Branch: ${wanted}; run git switch ${exists ? '' : '-c '}${wanted}`);
  }
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

const SKILL_DIR = path.dirname(HERE);
const readText = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

/** The lines under `## <heading>` of a markdown file, up to the next `## `, without surrounding blank lines. */
function sectionOf(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`no '## ${heading}' section`);
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join('\n').trimEnd();
}

/**
 * The first prompt of one task session: the task's brief and the rules it needs, read from
 * their one source files (task-mode.md, build-task.md, lean.md), so the session reads none of them
 * and runs neither next-task.mjs nor a land-task check.
 */
export function taskPrompt({ plan, planPath, number, root, learnings, sandbox, pluginRoot = PLUGIN_ROOT }) {
  const task = plan.tasks.find((entry) => entry.number === number);
  const fill = (text) => text
    .replaceAll('${CLAUDE_SKILL_DIR}', SKILL_DIR)
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot)
    .replaceAll('<checkout>', root)
    .replaceAll('<plan>', planPath)
    .replaceAll('<n>', String(number));
  const taskMode = readText(SKILL_DIR, 'references', 'task-mode.md');
  const builder = readText(pluginRoot, 'agents', 'build-task.md');
  const lean = readText(pluginRoot, 'skills', 'route-skills', 'references', 'lean.md');
  const drift = driftOf(task, root);
  return [
    `Land Task ${number} of ${planPath} in this session.`,
    `Report to: ${path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`)}`,
    ...drift.map((item) => `PLAN DRIFT: Task ${number}: ${item}`),
    '',
    'Brief:',
    taskBrief(task, frameOf(plan.frame), root).trimEnd(),
    '',
    fill(sectionOf(taskMode, 'Rules')),
    '',
    ...(task.design ? [fill(sectionOf(taskMode, 'Design tasks')), ''] : []),
    fill(sectionOf(builder, 'Git')),
    '',
    fill(sectionOf(builder, 'Build')),
    '',
    fill(sectionOf(builder, 'Stop')),
    '',
    fill(sectionOf(builder, 'Report')),
    '',
    `## Lean code\n\n${lean.slice(lean.indexOf('## ')).replaceAll('\n## ', '\n### ').replace(/^## /, '### ').trimEnd()}`,
    '',
    fill(sectionOf(taskMode, 'Finish')),
    '',
    '## This run',
    '',
    `- Change only the files this task lists. If a registry, index or test list must name the new file and is not listed, end on \`Task ${number}: BLOCKED <file> is missing from the file list\`.`,
    `- Read ${learnings} first, and before ending append one line on anything the next task should know.`,
    ...(sandbox
      ? ['- Bash runs in a sandbox. A command that fails with "Operation not permitted" or EPERM hit the sandbox, not a bug in the task. land-task reruns the proof outside the sandbox, so land when those are the only failures left.']
      : [])
  ].join('\n');
}

function reportLines(root, number) {
  const file = path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`);
  if (!isFileOnDisk(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return ['Unresolved', 'Decision'].flatMap((label) => {
    const line = lines.find((entry) => new RegExp(`^(?:- )?${label}:`).test(entry));
    return line === undefined || /:\s*none\.?\s*$/i.test(line) ? [] : [`Task ${number} ${line.replace(/^- /, '')}`];
  });
}

const money = (cost) => `$${cost.toFixed(2)}`;

const thousands = (tokens) => Math.round(tokens / 1000);

const clip = (text, length) => (text.length > length ? `${text.slice(0, length)}...` : text);

/** Elapsed milliseconds as mm:ss, or h:mm:ss past an hour. */
function clock(ms) {
  const total = Math.floor(ms / 1000);
  const two = (value) => String(value).padStart(2, '0');
  return total >= 3600 ? `${Math.floor(total / 3600)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}` : `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

/** Elapsed milliseconds in words: 45s, 12m 03s, 1h 02m. */
function duration(ms) {
  const total = Math.round(ms / 1000);
  const two = (value) => String(value).padStart(2, '0');
  if (total >= 3600) return `${Math.floor(total / 3600)}h ${two(Math.floor(total / 60) % 60)}m`;
  return total >= 60 ? `${Math.floor(total / 60)}m ${two(total % 60)}s` : `${total}s`;
}

/** Task numbers as "1, 2, 3" or "1-3" when they run on. */
function numbersText(numbers) {
  const parts = [];
  for (const number of [...numbers].sort((left, right) => left - right)) {
    const last = parts.at(-1);
    if (last !== undefined && last.to === number - 1) last.to = number;
    else parts.push({ from: number, to: number });
  }
  return parts.map(({ from, to }) => (to - from >= 2 ? `${from}-${to}` : from === to ? `${from}` : `${from}, ${to}`)).join(', ');
}

/** The few plain lines the terminal gets at the end; everything else is in detailLines. */
function summaryLines(run, stop) {
  const { plan, records, landings, logDir } = run;
  const landed = plan.tasks.map((task) => task.number).filter((number) => landings.has(number));
  const before = landed.filter((number) => landings.get(number).before).length;
  const missing = plan.tasks.map((task) => task.number).filter((number) => !landings.has(number));
  const lines = [`Landed ${landed.length} of ${plan.tasks.length} tasks${landed.length > 0 ? `: ${numbersText(landed)}` : ''}${before > 0 ? ` (${before} were already done before this run)` : ''}.`];
  if (missing.length > 0) lines.push(`Not landed: ${missing.length === 1 ? 'task' : 'tasks'} ${numbersText(missing)}. ${stop.why}.`);
  else if (stop.why !== undefined) lines.push(`${stop.why}.`);
  else lines.push(stop.gate === 'PASS' ? 'Final check passed.' : `Final check failed: ${run.verifyLines[0] ?? 'see the detail file'}.`);
  const denied = records.reduce((sum, record) => sum + record.denied.length, 0);
  if (denied > 0) lines.push(`${denied} command${denied === 1 ? ' was' : 's were'} refused by the permission rules; the detail file lists them.`);
  lines.push(`Next: ${stop.next}`);
  lines.push(`Cost ${money(records.reduce((sum, record) => sum + record.cost, 0))}, time ${duration(run.elapsed())}.`);
  lines.push(`Details: ${path.join(logDir, 'summary.txt')}`);
  return lines;
}

/** The full account kept in summary.txt, ending on the stop line. */
function detailLines(run, stop) {
  const { planPath, plan, branch, cap, records, landings, logDir, root } = run;
  const lines = [`Plan: ${planPath}`, `Branch: ${branch}`, `Iterations: ${records.filter((record) => record.task !== null).length} of ${cap}`, `Logs: ${logDir}`];
  const before = [...landings.values()].filter((landing) => landing.before).length;
  if (before > 0) lines.push(`${before} task${before === 1 ? '' : 's'} landed before the run.`);
  for (const task of plan.tasks) {
    const landing = landings.get(task.number);
    if (landing === undefined) lines.push(`Task ${task.number}: not landed`);
    else if (!landing.before) lines.push(`Task ${task.number}: ${landing.sha} iteration ${landing.record.iteration}, turns ${landing.record.turns}, cost ${money(landing.record.cost)}, peak context ${thousands(landing.record.peakContext)}k`);
    if (landing?.record?.peakContext > run.contextBudget) lines.push(`Task ${task.number}: peak context ${thousands(landing.record.peakContext)}k is over the ${thousands(run.contextBudget)}k budget; split similar tasks next time`);
  }
  lines.push(`Total cost: ${money(records.reduce((sum, record) => sum + record.cost, 0))}`);
  const tail = records.find((record) => record.task === null);
  if (tail !== undefined) lines.push(`Tail: ${tail.log}, turns ${tail.turns}, last line: ${tail.last || '(none)'}`);
  const denied = records.flatMap((record) => record.denied.map((command) => ({ record, command })));
  if (denied.length > 0) {
    lines.push(`Denied: ${denied.length} command${denied.length === 1 ? '' : 's'} (first 120 characters each; add one to Allow: if its task needs it; full text in the iteration logs)`);
    for (const { record, command } of denied) lines.push(`  iteration ${record.iteration}, task ${record.task}: ${clip(command, 120)}`);
  }
  lines.push(...run.verifyLines);
  for (const [number, landing] of landings) if (!landing.before) lines.push(...reportLines(root, number));
  if (run.uncommitted.size > 0) lines.push(`Uncommitted after a landing: ${[...run.uncommitted].join(', ')}`);
  const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- '));
  if (manual.length > 0) lines.push('Manual checks:', ...manual);
  lines.push(`run-plan: stop: ${stop.line}`);
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
    root: 'value', provider: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
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
  let provider;
  try {
    provider = chooseProvider(flags, os.homedir());
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stdout.write(`run-plan: refused: ${error.message}\n`);
    return 2;
  }
  const { model, effort } = provider;
  const planId = planIdOf(planPath);
  const landedAtStart = landedTasks(plan.tasks, root, planId);
  const cap = maxIterations ?? 2 * (plan.tasks.length - landedAtStart.length);
  const sandbox = provider.sandbox;
  const taskAllow = allowRules({ root, planPath, plan, sandbox: sandbox.enabled });
  const tailAllow = allowRules({ root, planPath, plan, tail: true, sandbox: sandbox.enabled });
  const taskSettings = sandboxSettings(sandbox);
  const tailSettings = sandboxSettings(sandbox, { tail: true });
  const learnings = path.join(root, SCRATCH_FOLDER, 'run-plan', planId, 'learnings.md');
  const buildPrompt = (number) => taskPrompt({ plan, planPath, number, root, learnings, sandbox: sandbox.enabled });

  if (flags['dry-run']) {
    const order = taskOrder(plan.tasks, landedAtStart);
    const first = order[0];
    process.stdout.write([
      `Provider: ${provider.name}`,
      `Model: ${model}`,
      `Effort: ${provider.asked} -> ${effort}`,
      'Env:', ...provider.shown.map(([variable, value]) => `  ${variable}=${value}`),
      `Caps: ${cap} iterations, ${timeoutMs / 60_000} minutes per session, ${provider.contextBudget} tokens of context per task`,
      `Order: ${order.length === 0 ? 'every task has landed' : order.map((number) => `Task ${number}`).join(', ')}`,
      sandbox.enabled
        ? `Sandbox: on, writes in ${root}, network: ${sandbox.allowedDomains.length === 0 ? 'none' : sandbox.allowedDomains.join(', ')}`
        : `Sandbox: off (${sandbox.reason})`,
      `Spawn: ${[claude.command, ...claude.prefix].join(' ')} ${claudeArgs({ model, effort, budget: flags['max-budget-usd'], allow: ['<allow>'], settings: sandbox.enabled ? '<sandbox settings>' : null }).join(' ')}`,
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
  if (!isFileOnDisk(learnings)) fs.writeFileSync(learnings, '# Learnings\n');
  const startedAt = Date.now();
  const run = { planPath, plan, branch, cap, root, contextBudget: provider.contextBudget, logDir, records: [], landings: new Map(), uncommitted: new Set(), verifyLines: [], elapsed: () => Date.now() - startedAt };
  for (const number of landedAtStart) {
    const task = plan.tasks.find((entry) => entry.number === number);
    run.landings.set(number, { before: true, sha: (taskCommits(task, root, planId)[0] ?? '').slice(0, 12) });
  }

  const tasksFile = path.join(logDir, 'tasks.json');
  const progressFile = path.join(logDir, 'progress.md');
  const passes = new Set(landedAtStart);
  const writeTasks = () => fs.writeFileSync(tasksFile, `${JSON.stringify(plan.tasks.map((task) => ({ number: task.number, title: task.title, passes: passes.has(task.number) })), null, 2)}\n`);
  fs.writeFileSync(progressFile, `# Progress\n\nPlan: ${planPath}\nBranch: ${branch}\n\n`);
  // One short line per event, on the terminal and in progress.md.
  const say = (text) => {
    const line = `[${clock(Date.now() - startedAt)}] ${text}`;
    fs.appendFileSync(progressFile, `- ${line}\n`);
    process.stdout.write(`${line}\n`);
  };
  writeTasks();
  say(`run start: ${path.relative(root, planPath) || planPath}, branch ${branch}, ${plan.tasks.length} tasks (${plan.tasks.length - landedAtStart.length} to build)`);

  // land-task runs the plan's Proof and Land gate outside the sandbox, so a session must not rewrite them.
  const planHash = () => (isFileOnDisk(planPath) ? createHash('sha256').update(fs.readFileSync(planPath)).digest('hex') : 'missing');
  const planAtStart = planHash();
  const planBreach = () => (planHash() === planAtStart ? null : 'plan changed');

  const spawnOne = async ({ prompt, allow, settings, pin, log }) => {
    const before = snapshot(root);
    const outcome = await spawnClaude(claude, claudeArgs({ model, effort, budget: flags['max-budget-usd'], allow, settings }), {
      cwd: root, env: childEnv(pin, provider), prompt, log, timeoutMs, refuseInit: (init) => exoError(init, PLUGIN_ROOT)
    });
    return { before, outcome, parsed: parseStream(outcome.text) };
  };

  let stall = 0;
  let retryNote = '';
  let iteration = 0;
  let stop;
  const fix = (log) => `read ${log}, fix the cause, then run exo run again`;
  for (;;) {
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
    iteration += 1;
    const n = task.number;
    const startedTask = Date.now();
    say(`task ${n} start${retryNote === '' ? '' : ` (try ${stall + 1})`}`);
    const log = path.join(logDir, `iter-${iteration}-task-${n}.log`);
    const trailer = planTaskTrailer(planId, n);
    const { before, outcome, parsed } = await spawnOne({ prompt: buildPrompt(n) + retryNote, allow: taskAllow, settings: taskSettings, pin: `${planId}/${n}`, log });
    const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
    // A denial is only logged: the task is judged by whether it landed, and a run that landed nothing counts toward the stall limit.
    const denied = parsed.denials.map((denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`);
    const record = { iteration, task: n, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last, denied };
    run.records.push(record);

    const breach = planBreach() ?? breachOf(root, before, { trailer });
    if (breach !== null) {
      say(`task ${n} stopped: ${breach}`);
      stop = { line: `breach in iteration ${iteration}: ${breach}`, why: `A session broke a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, undo what is wrong, then run exo run again` };
      break;
    }
    const notLoaded = exoError(parsed.init, PLUGIN_ROOT);
    if (notLoaded !== null) {
      say(`task ${n} stopped: exo not loaded`);
      stop = { line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again' };
      break;
    }
    if (landedTasks(plan.tasks, root, planId).includes(n)) {
      stall = 0;
      retryNote = '';
      run.landings.set(n, { sha: gitOut(root, ['rev-parse', '--short=12', 'HEAD']), record });
      passes.add(n);
      writeTasks();
      say(`task ${n} landed ${run.landings.get(n).sha.slice(0, 7)}, ${record.turns} turns, ${money(record.cost)}, ${Math.round((Date.now() - startedTask) / 1000)}s`);
      for (const line of (gitOut(root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean)) {
        const file = line.slice(3);
        if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
      }
      continue;
    }
    const blocked = outcome.timedOut ? null : last.match(new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`));
    if (blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'))) {
      const reason = blocked?.[1] || last;
      say(`task ${n} blocked: ${clip(reason, 80)}`);
      stop = { line: `task ${n} blocked: ${reason}; re-plan with exo:spec`, why: `Task ${n} is blocked: ${clip(reason, 100)}`, next: 're-plan with /exo:spec, then run exo run again' };
      break;
    }
    stall += 1;
    say(`task ${n} failed: ${outcome.timedOut ? last : clip(last, 80)}`);
    if (stall >= STALL_LIMIT) {
      stop = { line: `no progress on task ${n} in ${STALL_LIMIT} iterations, log ${log}`, why: `Task ${n} did not land in ${STALL_LIMIT} tries`, next: fix(log) };
      break;
    }
    retryNote = `\nThe previous attempt did not land task ${n}. Its last result line: ${last}\nIts log: ${log}`;
  }

  let exitCode = 1;
  if (stop === undefined) {
    iteration += 1;
    say('all tasks landed, final review start');
    const log = path.join(logDir, 'tail.log');
    const { before, outcome, parsed } = await spawnOne({ prompt: `/exo:verify ${planPath} Push nothing and open no pull request.`, allow: tailAllow, settings: tailSettings, pin: null, log });
    run.records.push({ iteration, task: null, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last: outcome.timedOut ? 'timed out' : lastLine(parsed.resultText), denied: [] });
    const breach = planBreach() ?? breachOf(root, before);
    const notLoaded = breach === null ? exoError(parsed.init, PLUGIN_ROOT) : null;
    if (breach !== null) stop = { line: `breach in iteration ${iteration}: ${breach}`, why: `The final review broke a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, then run exo run again`, gate: 'FAIL' };
    else if (notLoaded !== null) stop = { line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again', gate: 'FAIL' };
    else {
      const base = defaultBranch(root);
      const gate = spawnSync(process.execPath, [SCRIPT.verify, '--plan', planPath, '--root', root, ...(base === null ? [] : ['--base', base])], {
        cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
      });
      run.verifyLines = `${gate.stdout ?? ''}`.split('\n').filter((line) => /^(FAIL|STRAY|WARN)\b/.test(line));
      const pass = gate.status === 0;
      const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- ')).length;
      stop = {
        line: `done, ${plan.tasks.length}/${plan.tasks.length} tasks landed, gate ${pass ? 'PASS' : 'FAIL'}`,
        gate: pass ? 'PASS' : 'FAIL',
        next: pass
          ? `review branch ${branch}, then push it or open a pull request${manual > 0 ? `; ${manual} manual check${manual === 1 ? '' : 's'} are listed in the detail file` : ''}`
          : `read the failing lines in the detail file, fix them on ${branch}, then run exo run again`
      };
      if (pass) exitCode = 0;
    }
  }
  say(exitCode === 0 ? 'run done' : `run stopped: ${stop.why ?? 'final check failed'}`);
  if (exitCode === 0) fs.appendFileSync(progressFile, 'RUN COMPLETE\n');

  fs.writeFileSync(path.join(logDir, 'summary.txt'), `${detailLines(run, stop).join('\n')}\n`);
  process.stdout.write(`${summaryLines(run, stop).join('\n')}\n`);
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
