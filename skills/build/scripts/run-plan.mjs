#!/usr/bin/env node
// Runs a plan unattended: each unlanded task in a fresh headless `claude -p`
// process, the script picking the task and checking git after each process,
// then the review tail (run-tail.mjs: review and fix sessions, verify.mjs), ending on one stop line.
//
//   node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
//     [--provider <name>] [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--max-run-usd <x>] [--session auto|task|plan] [--claude <path>] [--plugin-dir <path>] [--dry-run]
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
// Exits 0 on done with gate PASS, 3 on a parked run (EXO_RUN_DIR's `parked` marker), 1 on any other stop, 2 on a refusal or bad
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
import { criterionCommand, defaultBranch, driftOf, frameOf, INLINE_TASK_LIMIT, landedTasks, loopCommands, parsePlan, planIdOf, planTaskTrailer, readyTasks, taskCommits } from '#plan-tasks';
import { redGreen, testPaths } from '#red-green';
import { environmentMs, isMain, parseFlags, UsageError } from '#script-flags';
import { excludeScratch, ScratchExcludeError } from '#scratch-exclude';
import { SCRATCH_FOLDER } from '#scratch-path';
import { readDecisions } from '#run-decision';
import { taskBrief } from './next-task.mjs';
import { updateRun } from './run-state.mjs';
import { runTail } from './run-tail.mjs';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';

const KILL_GRACE_MS = 5000;
const PARENT_POLL_MS = 5000;

/** Append to (or `write`) a log; a removed log dir (ENOENT) is not recreated and does not stop the run. */
function appendLog(file, text, write = fs.appendFileSync) {
  try {
    write(file, text);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  landTask: path.join(HERE, 'land-task.mjs'),
  runDecision: path.join(PLUGIN_ROOT, 'lib', 'run-decision.mjs'),
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
    sessionId: init?.session_id ?? final?.session_id ?? null,
    hooks: events.filter((event) => event.type === 'system' && event.subtype === 'hook_started').length,
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
export function allowRules({ root, planPath, plan, tail = false, pluginRoot = PLUGIN_ROOT, sandbox = false, decisions = Boolean(process.env.EXO_RUN_DIR) }) {
  const paths = [
    ...[root, pluginRoot, path.dirname(planPath)].flatMap((directory) => pathRule('Read', directory)),
    ...pathRule('Edit', root),
    ...pathRule('Write', root)
  ];
  if (sandbox) return [...new Set([...paths, ...scriptRules(unsandboxedScripts(tail))])];
  const scripts = [...(tail ? [SCRIPT.verify, SCRIPT.runProbes, SCRIPT.landTask] : [SCRIPT.landTask]), ...(decisions ? [SCRIPT.runDecision] : [])];
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

/** Tools per session kind: a review session writes only its findings file, a fix session edits like a build one. */
const SESSION_TOOLS = { build: 'Read,Edit,Write,Bash,Grep,Glob', fix: 'Read,Edit,Write,Bash,Grep,Glob', review: 'Read,Write,Glob,Grep,Bash' };

function claudeArgs({ model, effort, budget, allow, settings = null, kind = 'build', pluginDir = null }) {
  return [
    '-p', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--output-format', 'stream-json', '--verbose', '--model', model, '--effort', effort,
    ...(budget === undefined ? [] : ['--max-budget-usd', budget]),
    ...(settings === null ? [] : ['--settings', typeof settings === 'string' ? settings : JSON.stringify(settings)]),
    // No MCP servers: a run session uses none, and each configured server adds its tool schemas to every turn.
    '--strict-mcp-config',
    '--tools', SESSION_TOOLS[kind], '--disable-slash-commands',
    '--include-hook-events',
    ...(pluginDir === null ? [] : ['--plugin-dir', pluginDir]),
    '--allowedTools', ...allow,
    '--disallowedTools', ...DENY_RULES, 'mcp__*'
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

const untrackedPaths = (root) => (gitOut(root, ['ls-files', '--others', '--exclude-standard', '-z'], { trim: false }) ?? '').split('\0').filter(Boolean);

/**
 * Saves the plan session's leftover as a binary patch, built in a copy of the index: every tracked change against HEAD plus the untracked files absent from `knownUntracked`, never .exo/ or an ignored file.
 * Then restores the index and tracked files to HEAD and removes exactly those untracked files.
 * Returns `{ patch }` (null for a clean tree), or `{ patch, failed }` naming the git step or write that failed; a failure before the restore leaves the tree as it was.
 */
function shelveLeftover(root, patchFile, knownUntracked) {
  // A nested repository (listed as `dir/`) would enter the patch as a bare commit id, so it stays in place.
  const fresh = untrackedPaths(root).filter((file) => !knownUntracked.has(file) && !file.startsWith(`${SCRATCH_FOLDER}/`) && !file.endsWith('/'));
  const spec = ['--', '.', `:(exclude)${SCRATCH_FOLDER}`];
  const git = (args, options = {}) => spawnSync('git', ['-C', root, ...args], { maxBuffer: 1024 * 1024 * 1024, ...options });
  const failure = (step, answer) => ({ patch: null, failed: `${step} failed: ${String(answer.error?.message ?? answer.stderr ?? '').trim().split('\n')[0] || `exit ${answer.status}`}` });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-leftover-'));
  try {
    const indexFile = path.resolve(root, gitOut(root, ['rev-parse', '--git-path', 'index']) ?? '.git/index');
    const copy = path.join(scratch, 'index');
    if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, copy);
    const env = { ...process.env, GIT_INDEX_FILE: copy };
    const tracked = git(['add', '-u', ...spec], { env });
    if (tracked.status !== 0) return failure('git add -u', tracked);
    const added = fresh.length === 0 ? tracked : git(['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, input: fresh.join('\0') });
    if (added.status !== 0) return failure('git add of the untracked files', added);
    const diff = git(['diff', '--cached', '--binary', 'HEAD', ...spec], { env });
    if (diff.status !== 0) return failure('git diff', diff);
    if (diff.stdout.length === 0) return { patch: null };
    try {
      fs.writeFileSync(patchFile, diff.stdout);
    } catch (error) {
      return { patch: null, failed: `writing ${path.basename(patchFile)} failed: ${error.code ?? error.message}` };
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const restored = git(['restore', '--staged', '--worktree', '--source=HEAD', ...spec]);
  if (restored.status !== 0) return { ...failure('git restore', restored), patch: patchFile };
  for (const file of fresh) fs.rmSync(path.join(root, file), { force: true });
  return { patch: patchFile };
}

const planTaskLines = (root, sha) => (gitOut(root, ['log', '-1', '--format=%B', sha]) ?? '').split('\n').filter((line) => /^Plan-task: /.test(line));

/** The breach a process left, or null: a task allows one commit carrying only its own trailer, a tail session none (the script lands its fix), else any commit with no trailer. */
function breachOf(root, before, { trailer = null, tail = false } = {}) {
  const after = snapshot(root);
  if (after.remotes !== before.remotes) return 'remote ref moved';
  if (after.branch !== before.branch) return 'branch moved';
  if (after.head === before.head) return null;
  if (spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', before.head, after.head]).status !== 0) return 'branch moved';
  const commits = (gitOut(root, ['rev-list', `${before.head}..${after.head}`]) ?? '').split('\n').filter(Boolean);
  if (tail) return 'extra commit';
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
    // The child has its own process group, so a signal to the runner no longer reaches it: end the group, wait for its exit, then exit.
    const exitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
    const onSignal = (signal) => {
      const leave = () => {
        endTree('SIGKILL');
        process.exit(exitCodes[signal]);
      };
      endTree('SIGTERM');
      if (child.exitCode !== null || child.signalCode !== null) leave();
      else {
        child.once('exit', leave);
        setTimeout(leave, KILL_GRACE_MS);
      }
    };
    const signals = Object.keys(exitCodes);
    for (const signal of signals) process.on(signal, onSignal);
    // A parent that is gone (killed without a signal we see) leaves no one to stop the session: end it too.
    const parentPid = process.ppid;
    const parentWatch = setInterval(() => {
      if (process.ppid !== parentPid) onSignal('SIGHUP');
    }, PARENT_POLL_MS).unref();
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      clearInterval(parentWatch);
      for (const signal of signals) process.off(signal, onSignal);
      resolve({ text, code, signal, timedOut });
    };
    const record = (chunk) => {
      text += chunk;
      appendLog(log, chunk);
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
  const check = spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', planPath, '--root', root, '--loop', '--run'], { encoding: 'utf8' });
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
 * The first prompt of one task session: `run-task-prompt.md`'s `## Build session` filled with the
 * task's brief and the one land command, so the session reads no skill or rule file and runs
 * neither next-task.mjs nor a land-task check.
 */
export function taskPrompt({ plan, planPath, number, root, learnings, sandbox, retryNote = '', runDir = process.env.EXO_RUN_DIR }) {
  const task = plan.tasks.find((entry) => entry.number === number);
  const extra = [
    `- Read ${learnings} first, and before ending append one line on anything the next task should know.`,
    ...(task.design ? [`- Design task: build by steps 1-3 of ${path.join(SKILL_DIR, 'references', 'design-tasks.md')} \`## The delegate\`, contract first, with \`$RUN\` as ${path.join(root, '.exo')}.`] : []),
    ...(runDir
      ? [`- Never ask the user: decide from the spec and exo settings, then record each choice with \`node ${SCRIPT.runDecision} <source> <choice> <reason>\` (it appends to ${path.join(runDir, 'decisions.md')}) and go on.`]
      : []),
    ...(sandbox
      ? ['- Bash runs in a sandbox. A command that fails with "Operation not permitted" or EPERM hit the sandbox, not a bug in the task. land-task reruns the proof outside the sandbox, so land when those are the only failures left.']
      : [])
  ].join('\n');
  const fields = {
    task: `Task ${number}`,
    plan: planPath,
    root,
    report: path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`),
    brief: [...driftOf(task, root).map((item) => `PLAN DRIFT: Task ${number}: ${item}`), taskBrief(task, frameOf(plan.frame), root).trimEnd()].join('\n'),
    extra,
    land: `node "${SCRIPT.landTask}" --plan ${planPath} --task ${number} --root ${root}`,
    retry: retryNote
  };
  return sectionOf(readText(SKILL_DIR, 'run-task-prompt.md'), 'Build session').split('\n').slice(1).join('\n').trim()
    .replace(/\[\[(\w+)\]\]/g, (_, name) => fields[name])
    .replace(/\n\n\n+/g, '\n\n');
}

/**
 * The prompt of one plan session: `run-task-prompt.md`'s `## Plan session` filled with every listed
 * task's brief. The session lands none; the script lands them afterwards.
 */
export function planPrompt({ plan, planPath, numbers, root }) {
  const briefs = numbers.map((number) => {
    const task = plan.tasks.find((entry) => entry.number === number);
    return [...driftOf(task, root).map((item) => `PLAN DRIFT: Task ${number}: ${item}`), taskBrief(task, frameOf(plan.frame), root).trimEnd()].join('\n');
  });
  const fields = {
    tasks: `${numbers.length === 1 ? 'Task' : 'Tasks'} ${numbers.join(', ')}`,
    first: String(numbers[0]),
    plan: planPath,
    report: `${path.join(root, SCRATCH_FOLDER, 'implementer-<n>.md')}, one per task`,
    brief: ['Land nothing: the script lands each task after this session.', ...briefs].join('\n\n')
  };
  return sectionOf(readText(SKILL_DIR, 'run-task-prompt.md'), 'Plan session').split('\n').slice(1).join('\n').trim()
    .replace(/\[\[(\w+)\]\]/g, (_, name) => fields[name]);
}

/** `{ mode }` for the unlanded tasks, or `{ refused }` when `--session plan` asks for tasks that share a path. */
export function sessionMode(flag, tasks) {
  const seen = new Set();
  const shared = tasks.flatMap((task) => task.files.map((file) => file.path)).find((file) => seen.size === seen.add(file).size);
  if (flag === 'plan' && shared !== undefined) return { refused: `--session plan: more than one task lists ${shared}; use --session task` };
  if (flag === 'auto') return { mode: tasks.length > 0 && tasks.length <= INLINE_TASK_LIMIT && shared === undefined && !tasks.some((task) => task.design) ? 'plan' : 'task' };
  return { mode: flag };
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
  const decisions = process.env.EXO_RUN_DIR ? readDecisions(process.env.EXO_RUN_DIR) : [];
  if (decisions.length > 0) lines.push(`Decisions: ${decisions.length}, in ${path.join(process.env.EXO_RUN_DIR, 'decisions.md')}`);
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
  if (run.redGreenLine) lines.push(run.redGreenLine);
  lines.push(...run.verifyLines);
  for (const [number, landing] of landings) if (!landing.before) lines.push(...reportLines(root, number));
  if (run.uncommitted.size > 0) lines.push(`Uncommitted after a landing: ${[...run.uncommitted].join(', ')}`);
  const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- '));
  if (manual.length > 0) lines.push('Manual checks:', ...manual);
  const decisions = process.env.EXO_RUN_DIR ? readDecisions(process.env.EXO_RUN_DIR) : [];
  if (decisions.length > 0) lines.push('Decisions:', ...decisions);
  lines.push(`run-plan: stop: ${stop.line}`);
  return lines;
}

function numberFlag(value, name, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new UsageError(`flag '--${name}' needs a positive ${integer ? 'integer' : 'number'}`);
  return number;
}

// An exo run (EXO_RUN_DIR = <root>/.exo/run/<id>) gets its phase written; unset writes nothing.
function setPhase(phase) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) updateRun(path.resolve(dir, '..', '..', '..'), path.basename(dir), { phase });
}

async function main(argv) {
  const [planArgument, ...rest] = argv;
  if (planArgument === undefined || planArgument.startsWith('--')) throw new UsageError('the first argument names the plan file');
  const flags = parseFlags(rest, {
    root: 'value', provider: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
    'max-budget-usd': 'value', 'max-run-usd': 'value', session: 'value', claude: 'value', 'plugin-dir': 'value', 'dry-run': 'boolean'
  });
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
  // The run's start commit, written once: a resume keeps the first one.
  // No file while tasks already landed: HEAD holds their work, so the start is unknown (null) and the gate skips.
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
  // One short line per event, on the terminal and in progress.md.
  const say = (text) => {
    const line = `[${clock(Date.now() - startedAt)}] ${text}`;
    appendLog(progressFile, `- ${line}\n`);
    process.stdout.write(`${line}\n`);
  };
  writeTasks();
  if (process.env.EXO_RUN_DIR) for (const name of ['blocked', 'parked']) fs.rmSync(path.join(process.env.EXO_RUN_DIR, name), { force: true });
  say(`run start: ${path.relative(root, planPath) || planPath}, branch ${branch}, ${plan.tasks.length} tasks (${plan.tasks.length - landedAtStart.length} to build)`);

  // land-task runs the plan's Proof and Land gate outside the sandbox, so a session must not rewrite them.
  const planHash = () => (isFileOnDisk(planPath) ? createHash('sha256').update(fs.readFileSync(planPath)).digest('hex') : 'missing');
  const planAtStart = planHash();
  const planBreach = () => (planHash() === planAtStart ? null : 'plan changed');

  // One line per session in sessions.jsonl; the sum of costUsd is what --max-run-usd caps.
  const ledgerFile = path.join(logDir, 'sessions.jsonl');
  let spent = 0;
  const budgetStop = () => (runCap !== undefined && spent >= runCap
    ? { line: `budget: ${money(spent)} of ${money(runCap)}`, why: `The run spent its budget of ${money(runCap)}`, next: 'raise --max-run-usd, then run exo run again' }
    : null);
  // `kind` is the ledger's: task, plan, review or fix; a task or plan session gets the build tools.
  const spawnOne = async ({ prompt, allow, settings, pin, log, kind = 'task', task = null, sessionModel = model }) => {
    const before = snapshot(root);
    const budget = [sessionCap, runCap === undefined ? undefined : Number((runCap - spent).toFixed(6))].filter((value) => value !== undefined).reduce((low, value) => Math.min(low, value), Infinity);
    const outcome = await spawnClaude(claude, claudeArgs({ model: sessionModel, effort, budget: Number.isFinite(budget) ? String(budget) : undefined, allow, settings, kind: ['task', 'plan'].includes(kind) ? 'build' : kind, pluginDir }), {
      cwd: root, env: childEnv(pin, provider), prompt, log, timeoutMs, refuseInit: (init) => exoError(init, PLUGIN_ROOT)
    });
    const parsed = parseStream(outcome.text);
    spent += parsed.cost;
    appendLog(ledgerFile, `${JSON.stringify({ kind, task, sessionId: parsed.sessionId, costUsd: parsed.cost, hooks: parsed.hooks })}\n`);
    return { before, outcome, parsed };
  };

  let stall = 0;
  let retryNote = '';
  let iteration = 0;
  let stop;
  // The run-gate hook's `parked` marker (`Task <name>: PARKED <command>`): its line when it names `name`, read and removed.
  const takeParked = (name) => {
    const file = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'parked') : null;
    if (file === null || !fs.existsSync(file)) return null;
    const line = fs.readFileSync(file, 'utf8').trim();
    if (!line.startsWith(`Task ${name}: PARKED`)) return null;
    fs.rmSync(file, { force: true });
    return line.replace(/^Task \S+: PARKED\s*/, '');
  };
  const parkedStop = (line, log) => ({ line: `parked: ${line}`, why: `The run is parked: ${clip(line, 100)}`, next: `run exo approve for the open gate (see ${log}), then run exo run again`, parked: true });
  // The stop a finished session earns for breaking a rule, parking or failing to load exo; null when none.
  const unsafeStop = (n, before, trailer, parsed, log) => {
    const breach = planBreach() ?? breachOf(root, before, { trailer });
    if (breach !== null) {
      say(`task ${n} stopped: ${breach}`);
      return { line: `breach in iteration ${iteration}: ${breach}`, why: `A session broke a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, undo what is wrong, then run exo run again` };
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
    writeTasks();
    say(`task ${n} landed ${run.landings.get(n).sha.slice(0, 7)}, ${record.turns} turns, ${money(record.cost)}, ${Math.round((Date.now() - startedTask) / 1000)}s`);
    for (const line of (gitOut(root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean)) {
      const file = line.slice(3);
      if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
    }
  };
  // Plan mode: one session builds every task and lands none; the script then lands them in plan order, each under its own pin.
  if (chosen.mode === 'plan' && order.length > 0) {
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
      const record = { iteration, task: first, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last, denied: parsed.denials.map((denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`) };
      run.records.push(record);
      if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
      // The session is pinned to its first task, so one commit carrying only that task's trailer is tolerated and counts as landed.
      stop = unsafeStop(first, before, planTaskTrailer(planId, first), parsed, log) ?? undefined;
      const status = outcome.timedOut ? null : last.match(/^Task \d+: (?:BLOCKED|PLAN DRIFT)\b\s*(.*)$/);
      if (stop === undefined && status !== null) stop = blockedStop(first, status[1] || last);
      for (const n of stop === undefined ? order : []) {
        if (landedTasks(plan.tasks, root, planId).includes(n)) {
          markLanded(n, record, startedPlan);
          continue;
        }
        const landLog = path.join(logDir, `land-task-${n}.log`);
        const answer = spawnSync(process.execPath, [SCRIPT.landTask, '--plan', planPath, '--task', String(n), '--root', root], {
          cwd: root, env: { ...process.env, EXO_RUN_TASK: `${planId}/${n}` }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs
        });
        const output = `${answer.stdout ?? ''}${answer.stderr ?? ''}`;
        appendLog(landLog, output, fs.writeFileSync);
        if (answer.status === 0 && landedTasks(plan.tasks, root, planId).includes(n)) {
          markLanded(n, record, startedPlan);
          continue;
        }
        say(`task ${n} not landed by the script: ${clip(lastLine(output), 80)}`);
        retryNote = `\nThe previous attempt did not land task ${n}. Its last result line: ${lastLine(output)}\nIts log: ${landLog}`;
        break;
      }
      // The per-task fallback starts from HEAD: the session's leftover goes to a patch first.
      if (stop === undefined && landedTasks(plan.tasks, root, planId).length < plan.tasks.length) {
        const { patch, failed } = shelveLeftover(root, path.join(logDir, `plan-leftover-${iteration}.patch`), untrackedBefore);
        if (patch !== null) say(`plan session leftover saved to ${patch}`);
        // A fallback session on a dirty tree would build on the leftover, so a failed clean-up stops the run.
        if (failed !== undefined) {
          say(`plan session leftover not cleared: ${clip(failed, 80)}`);
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
    say(`task ${n} start${retryNote === '' ? '' : ` (try ${stall + 1})`}`);
    const log = path.join(logDir, `iter-${iteration}-task-${n}.log`);
    const trailer = planTaskTrailer(planId, n);
    const { before, outcome, parsed } = await spawnOne({ prompt: buildPrompt(n, retryNote), allow: taskAllow, settings: taskSettings, pin: `${planId}/${n}`, log, task: n });
    const last = outcome.timedOut ? `timed out after ${timeoutMs / 60_000} minutes` : lastLine(parsed.resultText) || `no result event (exit ${outcome.code ?? outcome.signal})`;
    // A denial is only logged: the task is judged by whether it landed, and a run that landed nothing counts toward the stall limit.
    const denied = parsed.denials.map((denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`);
    const record = { iteration, task: n, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last, denied };
    run.records.push(record);

    // The hook's marker is read and removed after every session, so none outlives its task.
    const markerFile = process.env.EXO_RUN_DIR ? path.join(process.env.EXO_RUN_DIR, 'blocked') : null;
    const marker = markerFile !== null && fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : null;
    if (markerFile !== null) fs.rmSync(markerFile, { force: true });

    stop = unsafeStop(n, before, trailer, parsed, log) ?? undefined;
    if (stop !== undefined) break;
    if (landedTasks(plan.tasks, root, planId).includes(n)) {
      markLanded(n, record, startedTask);
      continue;
    }
    const statusLine = new RegExp(`^Task ${n}: BLOCKED\\b\\s*(.*)$`);
    const blocked = marker?.match(statusLine) ?? (outcome.timedOut ? null : last.match(statusLine));
    if (blocked !== null || (!outcome.timedOut && last.includes('PLAN DRIFT'))) {
      stop = blockedStop(n, blocked?.[1] || last);
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
  if (stop === undefined) stop = budgetStop() ?? undefined;
  if (stop === undefined) {
    setPhase('verify');
    const base = defaultBranch(root);
    let sessions = 0;
    // One review or fix session of the tail: the breach, parked and plugin checks a task session gets, no pin.
    const runSession = async ({ kind, task = null, model: asked = null, prompt }) => {
      const budget = budgetStop();
      if (budget !== null) return { stop: { ...budget, gate: 'FAIL' } };
      sessions += 1;
      iteration += 1;
      const log = path.join(logDir, `tail-${sessions}-${kind}.log`);
      const sessionModel = asked !== null && provider.name === 'claude' ? asked : model;
      const { before, outcome, parsed } = await spawnOne({ prompt, allow: tailAllow, settings: tailSettings, pin: null, log, kind, task, sessionModel });
      const last = outcome.timedOut ? 'timed out' : lastLine(parsed.resultText);
      run.records.push({ iteration, task: null, log, turns: parsed.turns, cost: parsed.cost, peakContext: parsed.peakContext, last, denied: [] });
      const breach = planBreach() ?? breachOf(root, before, { tail: true });
      const parked = breach === null ? takeParked('tail') : null;
      const notLoaded = breach === null && parked === null ? exoError(parsed.init, PLUGIN_ROOT) : null;
      if (breach !== null) return { stop: { line: `breach in iteration ${iteration}: ${breach}`, why: `The final review or fix session breached a safety rule (${breach})`, next: `check git log on ${branch} and ${log}, then run exo run again`, gate: 'FAIL' } };
      if (parked !== null) return { stop: { ...parkedStop(parked, log), gate: 'FAIL' } };
      if (notLoaded !== null) return { stop: { line: `exo not loaded: ${notLoaded}`, why: `The plugin did not load (${clip(notLoaded, 80)})`, next: 'fix the plugin error, then run exo run again', gate: 'FAIL' } };
      return { resultText: outcome.timedOut ? '' : parsed.resultText };
    };
    // Success must fail on the run's start commit (tests of base..HEAD laid over it) and pass on the head.
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
        if (stall >= STALL_LIMIT) {
          run.redGreenLine = `Red-green: ${result.outcome}: ${result.lines[0]}`;
          return { line: `red-green: ${result.outcome}: ${result.lines[0]}`, why: `The Success criterion is not proved red-green (${clip(result.lines[0], 80)})`, next: 'fix the Success criterion or add Red: none (<reason>), then run exo run again', gate: 'FAIL' };
        }
        stall += 1;
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
      // Under exo run (EXO_RUN_DIR set), exo-cli lands a passing run per the plan's Land: line.
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
  say(exitCode === 0 ? 'run done' : `run stopped: ${stop.why ?? 'final check failed'}`);
  if (exitCode === 0) appendLog(progressFile, 'RUN COMPLETE\n');

  appendLog(path.join(logDir, 'summary.txt'), `${detailLines(run, stop).join('\n')}\n`, fs.writeFileSync);
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
