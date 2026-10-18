import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loopCommands } from '#plan-tasks';
import { ECOSYSTEM_MANIFESTS } from '#size-facts';
import { sumCounts, usageCounts } from '#token-weights';

const KILL_GRACE_MS = 5000;
const PARENT_POLL_MS = 5000;

export function appendLog(file, text, write = fs.appendFileSync) {
  try {
    write(file, text);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
export const SCRIPT = {
  landTask: path.join(HERE, 'land-task.mjs'),
  runDecision: path.join(PLUGIN_ROOT, 'lib', 'run-decision.mjs'),
  verify: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'run-probes.mjs'),
  planCheck: path.join(PLUGIN_ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs')
};

const SESSION_MARKERS = [
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID'
];

export const DENY_RULES = [
  'Bash(git push *)', 'Bash(gh *)', 'Bash(git reset *)', 'Bash(git rebase *)', 'Bash(git cherry-pick *)',
  'Bash(git merge *)', 'Bash(git tag *)', 'Bash(git switch *)', 'Bash(git checkout *)', 'Bash(git branch -D *)',
  'Bash(git commit *)', 'Bash(git stash *)', 'Bash(git clean *)', 'Bash(git restore *)', 'Bash(node *settings.mjs*)', 'Bash(node *memory.mjs*)',
  'Bash(npm publish*)', 'Bash(npm *publish*)', 'Bash(vercel*)', 'Bash(npx vercel*)',
  'Bash(netlify deploy*)', 'Bash(fly deploy*)', 'Bash(flyctl deploy*)'
];

const READ_ONLY_GIT = ['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'grep', 'branch --show-current', 'worktree list'];

export const SESSION_RULES = 'cwd is the run root: no `cd`. Chain Bash commands only when each part is allowed. Change files only with Edit/Write under the root, never a heredoc, python or `sed -i`. Record decisions only with the run-decision command.';
const READ_ONLY_INSPECT = ['ls', 'cat', 'grep', 'head', 'tail', 'wc', 'sed -n'];

export const isFileOnDisk = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

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

const denialText = (denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`;
export const deniedFields = (parsed) => ({ denied: parsed.denials.map(denialText), refused: parsed.refusals.map(denialText) });

export function parseStream(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event !== null && typeof event === 'object') events.push(event);
    } catch {
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
  const ruleDenied = new Set(events.filter((event) => event.type === 'system' && event.subtype === 'permission_denied').map((event) => event.tool_use_id));
  const calledIds = new Set(events.filter((event) => event.type === 'assistant').flatMap((event) => event.message?.content ?? []).filter((block) => block?.type === 'tool_use').map((block) => block.id));
  const isRefusal = (denial) => calledIds.has(denial.tool_use_id) && !ruleDenied.has(denial.tool_use_id);
  const peakContext = Math.max(0, ...events.filter((event) => event.type === 'assistant').map((event) => {
    const usage = event.message?.usage ?? {};
    return (Number(usage.input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0);
  }));
  const usageByCall = new Map();
  events.filter((event) => event.type === 'assistant' && event.message?.usage).forEach((event, index) => {
    usageByCall.set(event.message.id ?? index, event.message.usage);
  });
  // why: stream assistant events carry a partial output count; the result events' usage holds the real one.
  const resultOutput = results.reduce((sum, result) => sum + (Number(result.usage?.output_tokens) || 0), 0);
  const weightedTokens = sumCounts([...usageByCall.values()].map((usage) => ({ ...usageCounts(usage), output: 0 }))).weightedInput + resultOutput;
  const sumField = (field) => {
    const values = [...usageByCall.values()].map((usage) => usage[field]).filter((value) => typeof value === 'number');
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  };
  const firstCreation = events.find((event) => event.type === 'assistant' && event.message?.usage)?.message.usage.cache_creation_input_tokens;
  const costs = results.map((result) => result.total_cost_usd).filter((cost) => typeof cost === 'number');
  return {
    init,
    final,
    resultText: typeof final?.result === 'string' ? final.result : '',
    subtype: typeof final?.subtype === 'string' ? final.subtype : null,
    turns: results.reduce((sum, result) => sum + (Number(result.num_turns) || 0), 0),
    cost: costs.at(-1) ?? 0,
    peakContext,
    model: typeof init?.model === 'string' ? init.model : null,
    weightedTokens,
    cacheRead: sumField('cache_read_input_tokens'),
    cacheWrite: sumField('cache_creation_input_tokens'),
    firstCacheWrite: typeof firstCreation === 'number' ? firstCreation : null,
    sessionId: init?.session_id ?? final?.session_id ?? null,
    hooks: events.filter((event) => event.type === 'system' && event.subtype === 'hook_started').length,
    denials: [...denials.values()].filter((denial) => !isRefusal(denial)),
    refusals: [...denials.values()].filter(isRefusal)
  };
}

const realpathOr = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

export function exoError(init, pluginRoot) {
  if (init === null) return null;
  const error = (init.plugin_errors ?? []).find((entry) => /^exo(@|$)/.test(String(entry.plugin ?? '')));
  if (error !== undefined) return error.message ?? error.type ?? 'plugin error';
  const entry = (init.plugins ?? []).find((plugin) => plugin.name === 'exo');
  if (entry === undefined) return 'no exo plugin in the init event';
  if (realpathOr(entry.path) !== realpathOr(pluginRoot)) return `exo loads from ${entry.path}, not ${pluginRoot}`;
  return null;
}

const spellings = (file) => [...new Set([file, realpathOr(file)])];
const ruleSpelling = (spelling) => `/${spelling.split(path.sep).join('/')}`;
const pathRule = (tool, directory) => spellings(directory).map((spelling) => `${tool}(${ruleSpelling(spelling)}/**)`);
const fileRule = (tool, file) => spellings(file).map((spelling) => `${tool}(${ruleSpelling(spelling)})`);
const scriptRules = (files) => files.flatMap((file) => spellings(file).flatMap((spelling) => [`Bash(node "${spelling}" *)`, `Bash(node ${spelling} *)`]));

const unsandboxedScripts = (tail) => [...(tail ? [SCRIPT.verify, SCRIPT.runProbes, SCRIPT.landTask] : [SCRIPT.landTask]), SCRIPT.runDecision];

const ECOSYSTEMS = [
  { manifests: ECOSYSTEM_MANIFESTS.npm, domains: ['registry.npmjs.org'] },
  { manifests: ['yarn.lock'], domains: ['registry.yarnpkg.com'] },
  {
    manifests: ['*.csproj', '*.fsproj', '*.sln'],
    domains: ['api.nuget.org'],
    env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', MSBUILDDISABLENODEREUSE: '1', DOTNET_CLI_USE_MSBUILD_SERVER: '0' }
  },
  { manifests: ECOSYSTEM_MANIFESTS.pypi, domains: ['pypi.org', 'files.pythonhosted.org'] },
  { manifests: ECOSYSTEM_MANIFESTS.crates, domains: ['index.crates.io', 'static.crates.io'] },
  { manifests: ECOSYSTEM_MANIFESTS.go, domains: ['proxy.golang.org', 'sum.golang.org'] }
];

const REGISTRY_CONFIGS = [
  { file: '.npmrc', url: /^\s*(?:@[^\s:=]+:)?registry\s*=\s*(\S+)/gm },
  { file: '.yarnrc.yml', url: /^\s*npmRegistryServer\s*:\s*["']?([^"'\s]+)/gm },
  { file: 'nuget.config', url: /<add\b[^>]*\bvalue\s*=\s*"([^"]+)"/gi },
  { file: 'pip.conf', url: /^\s*(?:extra-)?index-url\s*=\s*(\S+)/gm }
];

function matchesManifest(pattern, name) {
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

function webHost(url) {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return parsed.hostname;
}

function configuredRegistries(root, entries) {
  return REGISTRY_CONFIGS.flatMap(({ file, url }) => {
    const entry = entries.find((name) => name.toLowerCase() === file);
    if (entry === undefined) return [];
    const text = fs.readFileSync(path.join(root, entry), 'utf8');
    return [...text.matchAll(url)].map((match) => webHost(match[1])).filter((host) => host !== null);
  });
}

export function projectEcosystems({ root, planFiles = [] }) {
  const entries = fs.readdirSync(root);
  const names = [...entries, ...planFiles.map((file) => path.basename(file))];
  const applied = ECOSYSTEMS.filter((ecosystem) => ecosystem.manifests.some((pattern) => names.some((name) => matchesManifest(pattern, name))));
  return {
    domains: [...applied.flatMap((ecosystem) => ecosystem.domains), ...configuredRegistries(root, entries)],
    env: Object.assign({}, ...applied.map((ecosystem) => ecosystem.env ?? {}))
  };
}

export function sandboxMode(config, { platform = process.platform, root = null, planFiles = [] } = {}) {
  if (platform === 'win32') return { enabled: false, reason: 'native Windows has no sandbox' };
  const sandbox = config?.defaults?.sandbox ?? {};
  if (sandbox.enabled === false) return { enabled: false, reason: 'sandbox.enabled is false in run.json' };
  const project = root === null ? [] : projectEcosystems({ root, planFiles }).domains;
  const extra = Array.isArray(sandbox.allowedDomains) ? sandbox.allowedDomains.map(String) : [];
  return { enabled: true, allowedDomains: [...new Set([...project, ...extra])] };
}

export function sandboxSettings(mode, { tail = false } = {}) {
  if (!mode.enabled) return null;
  const excludedCommands = [...new Set(unsandboxedScripts(tail).flatMap((file) => spellings(file).flatMap((spelling) => [`node "${spelling}"`, `node ${spelling}`, `node "${spelling}":*`, `node ${spelling}:*`])))];
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

export function allowRules({ root, planPath, plan, tail = false, repair = false, pluginRoot = PLUGIN_ROOT, sandbox = false, decisions = Boolean(process.env.EXO_RUN_DIR) }) {
  const paths = [
    ...[root, pluginRoot, path.dirname(planPath)].flatMap((directory) => pathRule('Read', directory)),
    ...pathRule('Edit', root),
    ...pathRule('Write', root),
    ...(repair ? fileRule('Edit', planPath) : [])
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

export function denyRules({ planPath, repair = false }) {
  if (repair) return [...DENY_RULES];
  return [...new Set([...DENY_RULES, ...fileRule('Edit', planPath), ...fileRule('Write', planPath)])];
}

const SESSION_TOOLS = { build: 'Read,Edit,Write,Bash,Grep,Glob', fix: 'Read,Edit,Write,Bash,Grep,Glob', review: 'Read,Write,Glob,Grep,Bash' };

const SESSION_AGENTS = { build: 'build-task', fix: 'fix-review', review: 'review-branch' };

export function agentMaxTurns(kind, pluginRoot = PLUGIN_ROOT) {
  const text = fs.readFileSync(path.join(pluginRoot, 'agents', `${SESSION_AGENTS[kind]}.md`), 'utf8');
  const turns = Number(/^maxTurns:\s*(\d+)\s*$/m.exec(text)?.[1]);
  if (!Number.isInteger(turns) || turns < 1) throw new Error(`agents/${SESSION_AGENTS[kind]}.md has no maxTurns`);
  return turns;
}

const STALL_HOOK = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node "${path.join(PLUGIN_ROOT, 'hooks', 'run-stall-guard.mjs')}"` }] }] } };

function withStallGuard(settings) {
  if (settings === null) return STALL_HOOK;
  return { ...(typeof settings === 'string' ? JSON.parse(settings) : settings), ...STALL_HOOK };
}

export function claudeArgs({ model, effort, budget, allow, settings: base = null, kind = 'build', pluginDir = null, stallGuard = false, resume = null, taskCount = 1, deny = DENY_RULES }) {
  const settings = stallGuard ? withStallGuard(base) : base;
  return [
    '-p', ...(resume === null ? [] : ['--resume', resume]),
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--output-format', 'stream-json', '--verbose',
    ...(model === null ? [] : ['--model', model]),
    ...(effort === null ? [] : ['--effort', effort]),
    ...(budget === undefined ? [] : ['--max-budget-usd', budget]),
    ...(settings === null ? [] : ['--settings', typeof settings === 'string' ? settings : JSON.stringify(settings)]),
    '--strict-mcp-config',
    '--tools', SESSION_TOOLS[kind], '--disable-slash-commands',
    '--include-hook-events',
    '--append-system-prompt', SESSION_RULES,
    '--exclude-dynamic-system-prompt-sections',
    '--max-turns', String(agentMaxTurns(kind) * (kind === 'build' ? taskCount : 1)),
    ...(pluginDir === null ? [] : ['--plugin-dir', pluginDir]),
    '--allowedTools', ...allow,
    '--disallowedTools', ...deny, 'mcp__*'
  ];
}

const SESSION_GIT_HOOKS = path.join(HERE, 'session-git-hooks');

// why: config set through the env reaches every git the session starts, sandboxed or wrapped by the stall guard, yet not the script's land after the session.
function refusingCommits(env, root) {
  const count = Number(env.GIT_CONFIG_COUNT) || 0;
  const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
  return {
    ...env,
    EXO_RUN_GIT_DIR: realpathOr(common),
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: 'core.hooksPath',
    [`GIT_CONFIG_VALUE_${count}`]: SESSION_GIT_HOOKS
  };
}

export function childEnv(pin, provider, { handoff = null, ecosystemEnv = {}, repair = false, refuseCommits = null } = {}) {
  const env = { ...process.env };
  for (const name of SESSION_MARKERS) delete env[name];
  delete env.EXO_RUN_TASK;
  delete env.EXO_RUN_HANDOFF;
  delete env.EXO_RUN_REPAIR;
  // why: run-no-wait asks a repair session for no task status line; its plan edit is the result.
  if (repair) env.EXO_RUN_REPAIR = '1';
  if (pin !== null) env.EXO_RUN_TASK = pin;
  if (handoff !== null) env.EXO_RUN_HANDOFF = handoff;
  if (provider.name !== 'claude') delete env.ANTHROPIC_API_KEY;
  if (provider.name === 'claude' && provider.promptCacheTtl === '5m') env.FORCE_PROMPT_CACHING_5M = '1';
  if (provider.name === 'claude' && provider.promptCacheTtl === '1h') delete env.FORCE_PROMPT_CACHING_5M;
  const merged = { ...ecosystemEnv, ...env, ...provider.env, ...(provider.effort === null ? {} : { CLAUDE_CODE_EFFORT_LEVEL: provider.effort }) };
  return refuseCommits === null ? merged : refusingCommits(merged, refuseCommits);
}

export function spawnClaude(claude, args, { cwd, env, prompt, log, timeoutMs, refuseInit = () => null }) {
  return new Promise((resolve) => {
    let text = '';
    let timedOut = false;
    let aborted = false;
    let initSeen = false;
    let partial = '';
    let settled = false;
    let graceTimer = null;
    // why: on POSIX a detached child leads its own process group, which the timeout can end whole.
    const child = spawn(claude.command, [...claude.prefix, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const endTree = (signal) => {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        else process.kill(-child.pid, signal);
      } catch {
      }
    };
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
    child.on('exit', (code, signal) => {
      if (!timedOut && !aborted) return;
      endTree('SIGKILL');
      settle(code, signal);
    });
    // why: after a kill a grandchild may still hold the pipes, so 'close' can lag behind 'exit'.
    child.on('close', settle);
    const timer = setTimeout(() => {
      timedOut = true;
      endTree('SIGTERM');
      graceTimer = setTimeout(() => {
        endTree('SIGKILL');
        settle(null, 'SIGKILL');
      }, KILL_GRACE_MS);
    }, timeoutMs);
  });
}
