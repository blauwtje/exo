#!/usr/bin/env node
// benchmarks/lean-gates.mjs
// One run of the lean-gates benchmark: exo at d33adf37 (old) or a8b27a45
// (new) runs the same fixed plan on a fresh copy of benchmarks/lean-gates/
// fixture in one `claude -p` session, build through verify. Everything lands
// under <out>/<NN>-<version>/, the layout lean-gates-metrics.mjs reads:
//
//   meta.json          version, plugin commit, argv, prompt, clock, exit
//   repo/              the fixture repository the session worked in
//   origin.git/        its bare origin (ship=local pushes nothing to it)
//   stdout.json        claude's --output-format json result
//   stderr.log
//   suite-runs.jsonl   one line per `npm test` call (fixture scripts/test.mjs)
//   exo-settings.txt   `settings.mjs show` in repo/, as the plugin resolves it
//
//   node benchmarks/lean-gates.mjs --version old|new --run <n> --out <dir>
//     [--plan old|new] [--model claude-opus-5-5] [--effort medium] [--budget 30]
//     [--timeout-min 110] [--dry-run]
//   node benchmarks/lean-gates.mjs --version <label> --plugin-dir <exo checkout> --plan old|new --run <n> --out <dir>
//   node benchmarks/lean-gates.mjs --version old|new --probe --out <dir>
//
// --out must sit outside every git work tree, with no CLAUDE.md,
// CLAUDE.local.md or .claude/ in any ancestor (the user config dir aside),
// since Claude Code loads those from parent directories whatever
// --setting-sources says. Use /Users/thomash/bench-runs/lean-gates-<date>.
//
// --dry-run prepares the run dir and prints the argv, prompt and env diff,
// and starts no session. A run dir that exists is never reused.
//
// --probe prepares <out>/probe-<version> exactly like a run, asks haiku for
// one word within $0.50, and checks the main transcript: no CLAUDE.md
// content reached the model, and exo's session hook context did.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confinedClaude } from '#confine-claude';
import { configDirectory } from '#config-directory';
import { exoLoaded } from './cell-usage.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BENCH = path.join(ROOT, 'benchmarks', 'lean-gates');
const FIXTURE = path.join(BENCH, 'fixture');
const PLANS = path.join(BENCH, 'plans');
const CACHE = path.join(ROOT, 'benchmarks', 'runs', 'lean-gates-cache');
// The bench worktrees sit under the main checkout's .worktrees/, whichever
// checkout of this repository runs the script.
const MAIN_CHECKOUT = path.dirname(execFileSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim());
const WORKTREES = path.join(MAIN_CHECKOUT, '.worktrees');
export const PLUGIN_DIRS = { old: path.join(WORKTREES, 'bench-old'), new: path.join(WORKTREES, 'bench-new') };

export const PLAN_STEM = 'business-invoices';
export const PLAN_PATH = `docs/plans/${PLAN_STEM}.md`;
export const BRANCH = 'feat/business-invoices';
const REPO_PLACEHOLDERS = ['@@REPO@@', '{{REPOSITORY}}'];

// Every schema key, set in the project layer so the user's global exo options
// (workspace=worktree, replies=terse) never reach either version. Defaults,
// except workspace and ship, which would otherwise ask.
export const EXO_SETTINGS = {
  specs: 'docs',
  replies: 'tight',
  budget: 'medium',
  ship: 'local',
  workspace: 'branch',
  guards: 'on'
};

const GIT_SETTINGS = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', '-c', 'commit.gpgsign=false'];
const NO_ANSWER = 'Nobody can answer a question during this run.';

// Identical for both versions. Build ends on verify in both (build
// references/tail.md), so the prompt names verify as the end, not a second step.
export const PROMPT = `First run \`npm test\` once in the foreground in this session, before any subagent starts. Then load the exo:build skill and run the plan ${PLAN_PATH}; the run is done when the branch passes exo:verify, which build ends on. Commit on a new branch ${BRANCH}; push nothing and open no pull request.\n${NO_ANSWER}`;

export const PROBE_PROMPT = 'Reply with the single word OK.';
const PROBE = { model: 'haiku', budget: '0.5', timeoutMin: 5 };

// --setting-sources does not reach CLAUDE.md discovery: the run that found
// this loaded ~/.claude/CLAUDE.md and the exo checkout's CLAUDE.md files as
// project instructions. The fixture has no CLAUDE.md of its own, so the run
// loads none, and no auto memory either.
export const ISOLATION_ENV = { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
const CONTEXT_NAMES = ['CLAUDE.md', 'CLAUDE.local.md', '.claude'];

export function parseArguments(argv) {
  const options = { version: null, plan: null, pluginDir: null, run: null, out: null, model: 'claude-opus-5-5', effort: 'medium', budget: '30', timeoutMin: 110, dryRun: false, probe: false };
  const value = (index) => {
    if (index >= argv.length) throw new Error(`${argv[index - 1]} needs a value`);
    return argv[index];
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--version') options.version = value(++index);
    else if (flag === '--plan') options.plan = value(++index);
    else if (flag === '--plugin-dir') options.pluginDir = path.resolve(value(++index));
    else if (flag === '--run') options.run = Number(value(++index));
    else if (flag === '--out') options.out = value(++index);
    else if (flag === '--model') options.model = value(++index);
    else if (flag === '--effort') options.effort = value(++index);
    else if (flag === '--budget') options.budget = value(++index);
    else if (flag === '--timeout-min') options.timeoutMin = Number(value(++index));
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--probe') options.probe = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  // --plugin-dir runs any exo checkout, such as a branch worktree; --version
  // then only labels the run dir and must not pass for old or new.
  if (options.pluginDir === null) {
    if (!(options.version in PLUGIN_DIRS)) throw new Error('--version must be old or new, or a label with --plugin-dir');
    options.pluginDir = PLUGIN_DIRS[options.version];
    options.plan ??= options.version;
  } else {
    if (options.version in PLUGIN_DIRS || !/^[\w.-]+$/.test(options.version ?? '')) throw new Error('with --plugin-dir, --version must be a label other than old or new, of letters, digits, dot, dash or underscore');
    if (options.plan === null) throw new Error('with --plugin-dir, name the plan: --plan old|new');
  }
  if (!(options.plan in PLUGIN_DIRS)) throw new Error('--plan must be old or new');
  if (options.probe) Object.assign(options, PROBE);
  else if (!Number.isInteger(options.run) || options.run < 1) throw new Error('--run must be a positive integer');
  if (options.out === null) throw new Error('--out <dir> is required');
  if (!(Number(options.timeoutMin) > 0)) throw new Error('--timeout-min must be a positive number');
  if (!(Number(options.budget) > 0)) throw new Error('--budget must be a positive number');
  return options;
}

export function runDirectoryName(run, version, probe = false) {
  return probe ? `probe-${version}` : `${String(run).padStart(2, '0')}-${version}`;
}

// Every CLAUDE.md, CLAUDE.local.md and .claude/ in the directory or an
// ancestor up to /, the ones Claude Code would load from a session there.
// The user config dir is the env's job (ISOLATION_ENV), so it is left out.
export function contextAncestors(directory, skip = [path.join(os.homedir(), '.claude'), configDirectory()]) {
  const skipped = new Set(skip.map((entry) => path.resolve(entry)));
  const found = [];
  let current = path.resolve(directory);
  for (;;) {
    for (const name of CONTEXT_NAMES) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate) && !skipped.has(candidate)) found.push(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) return found;
    current = parent;
  }
}

function insideWorkTree(directory) {
  let current = path.resolve(directory);
  while (!fs.existsSync(current)) current = path.dirname(current);
  const run = spawnSync('git', ['-C', current, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return run.status === 0 && run.stdout.trim() === 'true';
}

export function refuseContaminatedOut(runDirectory) {
  const problems = contextAncestors(runDirectory);
  if (insideWorkTree(runDirectory)) problems.push('a git work tree');
  if (problems.length > 0) throw new Error(`${runDirectory} sits under ${problems.join(', ')}; the session would load their instructions. Pick an --out outside, such as /Users/thomash/bench-runs/lean-gates-<date>`);
}

// What of a transcript says CLAUDE.md content reached the model. exo's own
// hook context and skill listing name CLAUDE.md in prose, so only a path to
// one counts, and the harness's "Contents of <path>" heading.
export function transcriptLeaks(text) {
  return {
    contentsOf: (text.match(/Contents of /g) ?? []).length,
    claudeMdPaths: (text.match(/[\\/]CLAUDE(\.local)?\.md/g) ?? []).length
  };
}

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...GIT_SETTINGS, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The harness keeps a transcript at <config dir>/projects/<slug>/, the slug
// being the session's real cwd with every non-alphanumeric character a dash.
export function transcriptDirectory(cwd) {
  return path.join(configDirectory(), 'projects', fs.realpathSync(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
}

// The parent's Claude Code session leaks its id, effort, child markers and
// settings env (such as CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS) through the
// environment; every benchmark child starts clean of them.
export function withoutParentSession(base) {
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === 'CLAUDECODE' || key === 'CLAUDE_EFFORT' || key.startsWith('CLAUDE_CODE_')) continue;
    env[key] = value;
  }
  return env;
}

export function childEnvironment(base, runDirectory) {
  const env = withoutParentSession(base);
  Object.assign(env, ISOLATION_ENV);
  env.BENCH_SUITE_LOG = path.join(runDirectory, 'suite-runs.jsonl');
  return env;
}

export function environmentDiff(base, env) {
  const removed = Object.keys(base).filter((key) => !(key in env)).sort();
  const added = Object.keys(env).filter((key) => base[key] !== env[key]).sort().map((key) => `${key}=${env[key]}`);
  return { removed, added };
}

export function claudeArguments(options, pluginDir, sessionId, prompt = PROMPT) {
  return [
    '-p', prompt,
    '--plugin-dir', pluginDir,
    '--model', options.model,
    '--effort', options.effort,
    '--output-format', 'json',
    '--setting-sources', 'project,local',
    '--strict-mcp-config',
    '--max-budget-usd', String(options.budget),
    '--session-id', sessionId
  ];
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// One install per lockfile: node_modules in the cache, keyed by the
// lockfile's hash, seeded from fixture/node_modules when that is present.
function ensureNodeModules() {
  const lock = path.join(FIXTURE, 'package-lock.json');
  const stamp = path.join(CACHE, 'lock.sha256');
  const modules = path.join(CACHE, 'node_modules');
  const hash = sha256(lock);
  if (fs.existsSync(modules) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === hash) return modules;
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, 'package.json'), path.join(CACHE, 'package.json'));
  fs.copyFileSync(lock, path.join(CACHE, 'package-lock.json'));
  const seed = path.join(FIXTURE, 'node_modules');
  if (fs.existsSync(seed)) {
    cloneTree(seed, modules);
    console.log(`node_modules cache seeded from ${seed}`);
  } else {
    console.log(`npm ci into ${CACHE}`);
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: CACHE, stdio: 'inherit' });
  }
  fs.writeFileSync(stamp, `${hash}\n`);
  return modules;
}

// An APFS clone (cp -c) costs no space; a filesystem without clones gets a copy.
function cloneTree(from, to) {
  const clone = spawnSync('cp', ['-c', '-R', from, to], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (clone.status === 0) return;
  fs.rmSync(to, { recursive: true, force: true });
  execFileSync('cp', ['-R', from, to]);
}

export function planText(version, repository) {
  const file = path.join(PLANS, `${version}.md`);
  let text = fs.readFileSync(file, 'utf8');
  for (const placeholder of REPO_PLACEHOLDERS) text = text.replaceAll(placeholder, repository);
  const branch = text.match(/^Branch:\s*`?([^`\s]+)`?/m)?.[1];
  if (branch !== undefined && branch !== BRANCH) throw new Error(`${file} names Branch: ${branch}, the prompt names ${BRANCH}`);
  return text;
}

export function prepareRepository(runDirectory, version, modules) {
  const repository = path.join(runDirectory, 'repo');
  fs.cpSync(FIXTURE, repository, { recursive: true, filter: (source) => path.basename(source) !== 'node_modules' });
  const real = fs.realpathSync(repository);
  fs.mkdirSync(path.join(repository, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(repository, PLAN_PATH), planText(version, real));
  fs.mkdirSync(path.join(repository, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repository, '.claude', 'exo.json'), `${JSON.stringify(EXO_SETTINGS, null, 2)}\n`);
  const ignore = path.join(repository, '.gitignore');
  const ignored = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8').split('\n') : [];
  const missing = ['node_modules/', '.claude/', '.bench/'].filter((line) => !ignored.includes(line));
  if (missing.length > 0) fs.appendFileSync(ignore, `${missing.join('\n')}\n`);
  git(repository, ['init', '-q', '-b', 'main']);
  // exo lists its scratch dir here itself (lib/scratch-exclude.mjs, both versions); seeding it keeps .exo/ out of any early `git add -A`.
  fs.appendFileSync(path.join(repository, '.git', 'info', 'exclude'), '.exo/\n');
  git(repository, ['add', '-A']);
  git(repository, ['commit', '-q', '-m', 'chore: seed the invoice library and its plan']);
  const origin = path.join(runDirectory, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(repository, ['remote', 'add', 'origin', origin]);
  git(repository, ['push', '-q', 'origin', 'main']);
  git(repository, ['remote', 'set-head', 'origin', 'main']);
  cloneTree(modules, path.join(repository, 'node_modules'));
  return real;
}

function settingsReport(pluginDir, repository, env) {
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'skills', 'configure', 'scripts', 'settings.mjs'), 'show'], { cwd: repository, env, encoding: 'utf8' });
  return `${run.stdout}${run.stderr}`;
}

function writeMeta(runDirectory, meta) {
  fs.writeFileSync(path.join(runDirectory, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

// The session is confined by #confine-claude to the run directory, which
// holds repo/, origin.git/ and the suite log its tests append to, and a
// temporary directory removed when the session ends.
function runClaude(argv, cwd, env, runDirectory, timeoutMs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-lean-tmp-'));
  const run = confinedClaude({ args: argv, roots: [runDirectory, tmp], cwd, tmp });
  return new Promise((resolve) => {
    const stdout = fs.openSync(path.join(runDirectory, 'stdout.json'), 'w');
    const stderr = fs.openSync(path.join(runDirectory, 'stderr.log'), 'w');
    const started = Date.now();
    // Its own process group, so a timeout kills the session's shells and test runs too.
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...env, ...run.env }, stdio: ['ignore', stdout, stderr], detached: true });
    const killGroup = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);
    const forward = () => {
      killGroup();
    };
    process.once('SIGINT', forward);
    process.once('SIGTERM', forward);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      fs.rmSync(tmp, { recursive: true, force: true });
      resolve({ exitCode, signal, timedOut, wallMs: Date.now() - started });
    });
  });
}

function probeChecks(meta) {
  const transcript = path.join(meta.transcriptDir, `${meta.sessionId}.jsonl`);
  const text = fs.existsSync(transcript) ? fs.readFileSync(transcript, 'utf8') : null;
  const leaks = text === null ? null : transcriptLeaks(text);
  const loaded = exoLoaded(meta.sessionId);
  console.log(`transcript: ${text === null ? `(missing) ${transcript}` : transcript}`);
  const checks = [
    ['session exit 0', meta.exitCode === 0, `exit ${meta.exitCode}`],
    ['no "Contents of" heading', leaks !== null && leaks.contentsOf === 0, `count ${leaks?.contentsOf ?? 'n/a'}`],
    ['no CLAUDE.md path', leaks !== null && leaks.claudeMdPaths === 0, `count ${leaks?.claudeMdPaths ?? 'n/a'}`],
    ['exo session hook context loaded', loaded === true, `exoLoaded ${loaded}`]
  ];
  for (const [name, pass, detail] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name} (${detail})`);
  return checks.every(([, pass]) => pass);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { pluginDir } = options;
  if (!fs.existsSync(path.join(pluginDir, '.claude-plugin'))) throw new Error(`${pluginDir} holds no plugin`);
  const name = runDirectoryName(options.run, options.version, options.probe);
  const runDirectory = path.resolve(options.out, name);
  if (fs.existsSync(runDirectory)) throw new Error(`${runDirectory} exists; a run dir is never reused`);
  refuseContaminatedOut(runDirectory);
  const modules = ensureNodeModules();
  fs.mkdirSync(runDirectory, { recursive: true });
  const repository = prepareRepository(runDirectory, options.plan, modules);
  const env = childEnvironment(process.env, runDirectory);
  fs.writeFileSync(path.join(runDirectory, 'exo-settings.txt'), settingsReport(pluginDir, repository, env));
  const sessionId = crypto.randomUUID();
  const prompt = options.probe ? PROBE_PROMPT : PROMPT;
  const argv = claudeArguments(options, pluginDir, sessionId, prompt);
  const meta = {
    version: options.version,
    plan: options.plan,
    run: options.run,
    probe: options.probe,
    pluginDir,
    pluginCommit: execFileSync('git', ['-C', pluginDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    pluginDirty: execFileSync('git', ['-C', pluginDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
    model: options.model,
    effort: options.effort,
    budget: String(options.budget),
    timeoutMin: Number(options.timeoutMin),
    sessionId,
    argv: ['claude', ...argv],
    prompt,
    planPath: PLAN_PATH,
    repo: repository,
    // Names only for what was stripped; values for what the run sets, ISOLATION_ENV among them.
    env: environmentDiff(process.env, env),
    dryRun: options.dryRun,
    startedAt: null,
    endedAt: null,
    wallMs: null,
    exitCode: null,
    signal: null,
    timedOut: null,
    claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    nodeVersion: process.version,
    transcriptDir: transcriptDirectory(repository)
  };
  if (options.dryRun) {
    writeMeta(runDirectory, meta);
    console.log(`run dir: ${runDirectory}`);
    console.log(`cwd: ${repository}`);
    console.log(`argv: ${JSON.stringify(meta.argv)}`);
    console.log(`prompt:\n${prompt}`);
    console.log(`env removed: ${meta.env.removed.join(' ') || '(none)'}`);
    console.log(`env added: ${meta.env.added.join(' ')}`);
    console.log(`transcript dir: ${meta.transcriptDir}`);
    console.log('dry run: no session started');
    return;
  }
  meta.startedAt = new Date().toISOString();
  writeMeta(runDirectory, meta);
  console.log(`${name}: session ${sessionId} started ${meta.startedAt}`);
  const result = await runClaude(argv, repository, env, runDirectory, Number(options.timeoutMin) * 60 * 1000);
  Object.assign(meta, { endedAt: new Date().toISOString(), ...result });
  writeMeta(runDirectory, meta);
  console.log(`${name}: exit ${result.exitCode}${result.signal ? ` signal ${result.signal}` : ''}${result.timedOut ? ' (timed out)' : ''} after ${Math.round(result.wallMs / 60000)} min`);
  if (options.probe && !probeChecks(meta)) process.exitCode = 1;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`lean-gates: ${error.message}`);
    process.exitCode = 1;
  });
}
