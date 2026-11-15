import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { scratchPath } from '#scratch-path';
import { environmentMs } from '#script-flags';
import { frameOf } from '#plan-frame';
import { parsePlan, PlanError } from '#plan-tasks';
import { runBounded } from '../../../lib/bounded-command.mjs';
import { Refusal } from './cli-refusal.mjs';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';
import { insideClaudeCode } from './run-session-env.mjs';
import { resolveClaude } from './run-session-claude.mjs';

const LAUNCHER = [
  '#!/bin/sh',
  'pointer="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo"',
  'root=$(head -n 1 "$pointer/plugin-root") || exit 1',
  '[ -d "$root" ] || root=$(head -n 1 "$pointer/plugin-main") || exit 1',
  'exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"',
  ''
].join('\n');

const OLD_LAUNCHER = [
  '#!/bin/sh',
  'root=$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root") && exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"',
  ''
].join('\n');

export function setupCommand() {
  const home = os.homedir();
  const bin = path.join(home, '.local', 'bin');
  const target = path.join(bin, 'exo');
  if (fs.existsSync(target) && ![LAUNCHER, OLD_LAUNCHER].includes(fs.readFileSync(target, 'utf8'))) {
    throw new Refusal(`refused: ${target} already exists and is not the exo launcher; move it, then rerun exo setup`);
  }
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(target, LAUNCHER, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  fs.mkdirSync(configDir(home), { recursive: true });
  process.stdout.write([
    `exo: launcher ${target}`,
    `exo: keys file ${path.join(configDir(home), 'keys.env')}; store the key for each provider you use:`,
    'exo key set deepseek',
    'exo key set zai',
    ''
  ].join('\n'));
  if (!(process.env.PATH ?? '').split(path.delimiter).includes(bin)) {
    process.stdout.write(`exo: warning: ${bin} is not on PATH; add it to your shell profile\n`);
  }
}

export async function claudeCommand(args) {
  const outcome = await startClaude(args, { home: os.homedir() });
  if (outcome.refused) throw new Refusal(outcome.refused);
  process.exitCode = outcome.code;
}

export async function keyCommand(args) {
  if (args[0] !== 'set' || args.length !== 2) throw new Refusal(`usage: exo key set <provider> (got: ${args.join(' ') || 'no arguments'})`);
  const home = os.homedir();
  const name = args[1];
  const providers = loadRunConfig({ home }).providers;
  const variable = Object.hasOwn(providers, name) ? providers[name].key : undefined;
  if (!variable) throw new Refusal(`refused: ${JSON.stringify(name)} is not a provider with a key; known: ${Object.keys(providers).filter((known) => providers[known].key).join(', ')}`);
  const file = path.join(configDir(home), 'keys.env');
  try {
    writeKey(file, variable, await readKeyInput(process.stdin, process.stderr));
  } catch (error) {
    throw new Refusal(`refused: ${error.message} (${file})`);
  }
  process.stdout.write(`exo: ${variable} stored in ${file}\n`);
}

const SETUP_TIMEOUT_MS = 600_000;

const SETUP_BY_RUNNER = [
  { runner: /\bplaywright\b/, command: 'npx -y playwright install chromium' },
  { runner: /\bcypress\b/, command: 'npx -y cypress install' },
];

function setupCommands(frame, tasks) {
  const text = [frame.app?.start ?? '', ...tasks.map((task) => task.proof ?? '')].join('\n');
  return SETUP_BY_RUNNER.filter(({ runner }) => runner.test(text)).map(({ command }) => command);
}

async function runSetupCommands(commands, checkout) {
  if (commands.length === 0) return null;
  const logFile = scratchPath(checkout, 'logs/env-preflight.log');
  fs.mkdirSync(scratchPath(checkout, 'logs'), { recursive: true });
  for (const command of commands) {
    const run = await runBounded(`cd '${checkout.replaceAll("'", "'\\''")}' && ${command}`, environmentMs('EXO_SETUP_TIMEOUT_MS', SETUP_TIMEOUT_MS));
    fs.appendFileSync(logFile, `$ ${command}\n${run.output}\n`);
    if (!run.ok) return { command, logFile };
  }
  return null;
}

function parsedPlan(planPath) {
  try {
    return parsePlan(fs.readFileSync(planPath, 'utf8'));
  } catch (error) {
    if (error instanceof PlanError) return null;
    throw error;
  }
}

export async function setupRefusal(planPath, checkout) {
  const plan = parsedPlan(planPath);
  if (plan === null || frameOf(plan.frame) === null) return null;
  const failure = await runSetupCommands(setupCommands(frameOf(plan.frame), plan.tasks), checkout);
  if (failure === null) return null;
  return `setup command \`${failure.command}\` failed, log ${failure.logFile}. Next: fix the environment, then rerun start-run.`;
}

const KEY_NAME = /^\w+$/;

function checkKeyValue(value) {
  if (!value) return 'the key is empty';
  if (/\s/.test(value)) return 'the key holds whitespace or a newline';
  return null;
}

function replaced(lines, name, value) {
  const at = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('#') && trimmed.split('=')[0].trim() === name && trimmed.includes('=');
  });
  if (at < 0) return null;
  return lines.map((line, index) => (index === at ? `${name}=${value}` : line));
}

function keysFileText(existing, name, value) {
  const lines = existing.split('\n');
  const swapped = replaced(lines, name, value);
  if (swapped) return swapped.join('\n');
  if (existing === '') return `${name}=${value}\n`;
  return `${existing}${existing.endsWith('\n') ? '' : '\n'}${name}=${value}\n`;
}

export function writeKey(file, name, value) {
  if (!KEY_NAME.test(name)) throw new Error(`bad key name ${JSON.stringify(name)}`);
  const problem = checkKeyValue(value);
  if (problem) throw new Error(problem);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const temporary = path.join(directory, `.keys.env.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, keysFileText(existing, name, value), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function readPiped(stdin) {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text.replace(/\r?\n$/, '');
}

function readHidden(stdin, stderr) {
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (action) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stderr.write('\n');
      action();
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(() => reject(new Error('cancelled')));
        if (character === '\r' || character === '\n') return finish(() => resolve(value));
        value = character === '\u007f' ? value.slice(0, -1) : value + character;
      }
    };
    stderr.write('Key (input hidden): ');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

export function readKeyInput(stdin, stderr) {
  return stdin.isTTY ? readHidden(stdin, stderr) : readPiped(stdin);
}

const HOUR_MS = 3600000;
const SEARCH_HOURS = 24 * 8;

function isPeakHour(timeMs, { days, hoursUtc }) {
  const date = new Date(timeMs);
  const hour = date.getUTCHours();
  return days.includes(date.getUTCDay()) && hoursUtc.some(([from, to]) => hour >= from && hour < to);
}

function deepseekPeak(timeMs, windows) {
  if (!isPeakHour(timeMs, windows)) return { peak: false, nextOffPeak: null };
  const hourStart = Math.floor(timeMs / HOUR_MS) * HOUR_MS;
  for (let step = 1; step <= SEARCH_HOURS; step += 1) {
    const candidate = hourStart + step * HOUR_MS;
    if (!isPeakHour(candidate, windows)) return { peak: true, nextOffPeak: new Date(candidate).toISOString() };
  }
  return { peak: true, nextOffPeak: null };
}

export function peakNotice(timeMs, windows) {
  const { peak, nextOffPeak } = deepseekPeak(timeMs, windows);
  if (!peak) return null;
  const until = nextOffPeak === null ? 'no off-peak hour is configured' : `off-peak starts at ${nextOffPeak}`;
  return `notice: DeepSeek peak hours bill double; ${until}.`;
}

const USAGE = 'usage: exo claude [--provider <name>] [--effort <level>] [-- <claude args>]';

function parseArgs(args) {
  const separator = args.indexOf('--');
  const own = separator < 0 ? args : args.slice(0, separator);
  const passed = separator < 0 ? [] : args.slice(separator + 1);
  const flags = {};
  for (let at = 0; at < own.length; at += 2) {
    const name = own[at];
    if (!['--provider', '--effort'].includes(name) || own[at + 1] === undefined) return { refused: USAGE };
    flags[name.slice(2)] = own[at + 1];
  }
  return { flags, passed };
}

function claudeEnvironment({ config, keys, home, env, provider: name, effort }) {
  if (!Object.hasOwn(config.providers, name)) {
    return { refused: `refused: unknown provider ${JSON.stringify(name)}; known: ${Object.keys(config.providers).join(', ')}` };
  }
  if (effort !== undefined && !config.efforts.includes(effort)) {
    return { refused: `refused: unknown effort ${JSON.stringify(effort)}; use one of ${config.efforts.join(', ')}` };
  }
  const resolved = resolveProvider(config, name, { keys, effort, home });
  if (resolved.refused !== undefined) return { refused: `refused: ${resolved.refused}` };
  const inherited = { ...env };
  if (name !== 'claude') delete inherited.ANTHROPIC_API_KEY;
  const setsEffort = effort !== undefined || config.providers[name].effort !== undefined;
  return {
    provider: name,
    env: { ...inherited, ...resolved.env, ...(setsEffort ? { CLAUDE_CODE_EFFORT_LEVEL: resolved.effort } : {}) }
  };
}

function runChild(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGQUIT']) process.on(signal, () => {});
    child.on('error', (error) => resolve({ refused: `refused: cannot start claude: ${error.message}` }));
    child.on('exit', (code) => resolve({ code: code ?? 1 }));
  });
}

function loadConfig(home) {
  try {
    return { config: loadRunConfig({ home }) };
  } catch (error) {
    return { refused: `refused: ${path.join(configDir(home), 'run.json')} does not load: ${error.message}` };
  }
}

function printPeakNotice(provider, config, env) {
  if (provider !== 'deepseek') return;
  const notice = peakNotice(environmentMs('EXO_NOW_MS', Date.now(), env), config.defaults.deepseekPeak);
  if (notice) process.stderr.write(`${notice}\n`);
}

async function startClaude(args, { home }) {
  if (insideClaudeCode()) return { refused: 'refused: exo claude starts an interactive session and runs only from a terminal, not inside a Claude Code session' };
  const parsed = parseArgs(args);
  if (parsed.refused) return parsed;
  const loaded = loadConfig(home);
  if (loaded.refused) return loaded;
  const built = claudeEnvironment({
    config: loaded.config,
    keys: readKeys(path.join(configDir(home), 'keys.env')),
    home,
    env: process.env,
    provider: parsed.flags.provider ?? loaded.config.defaults.provider,
    effort: parsed.flags.effort
  });
  if (built.refused) return built;
  printPeakNotice(built.provider, loaded.config, process.env);
  const claude = resolveClaude({});
  if (claude.refused) return { refused: `refused: ${claude.refused}` };
  return runChild(claude.command, [...claude.prefix, ...parsed.passed], built.env);
}
