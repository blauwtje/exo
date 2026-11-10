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
import { configDir, loadRunConfig } from './run-config.mjs';
import { readKeyInput, writeKey } from './run-keys.mjs';
import { startClaude } from './exo-claude.mjs';

const LAUNCHER = [
  '#!/bin/sh',
  'pointer="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo"',
  'root=$(head -n 1 "$pointer/plugin-root") || exit 1',
  '[ -d "$root" ] || root=$(head -n 1 "$pointer/plugin-main") || exit 1',
  'exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"',
  ''
].join('\n');

// why: the launcher exo setup wrote before plugin-main; a rerun of setup replaces it.
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
  if (args[0] !== 'set' || args.length !== 2) throw new Refusal('usage: exo key set <provider>');
  const home = os.homedir();
  const name = args[1];
  const providers = loadRunConfig({ home }).providers;
  const variable = Object.hasOwn(providers, name) ? providers[name].key : undefined;
  if (!variable) throw new Refusal(`refused: ${JSON.stringify(name)} is not a provider with a key; known: ${Object.keys(providers).filter((known) => providers[known].key).join(', ')}`);
  const file = path.join(configDir(home), 'keys.env');
  try {
    writeKey(file, variable, await readKeyInput(process.stdin, process.stderr));
  } catch (error) {
    throw new Refusal(`refused: ${error.message}`);
  }
  process.stdout.write(`exo: ${variable} stored in ${file}\n`);
}

const SETUP_TIMEOUT_MS = 600_000;

const SETUP_BY_RUNNER = [
  { runner: /\bplaywright\b/, command: 'npx -y playwright install chromium' },
  { runner: /\bcypress\b/, command: 'npx -y cypress install' },
];

export function setupCommands(frame, tasks) {
  const text = [frame.app?.start ?? '', ...tasks.map((task) => task.proof ?? '')].join('\n');
  return SETUP_BY_RUNNER.filter(({ runner }) => runner.test(text)).map(({ command }) => command);
}

export async function runSetupCommands(commands, checkout) {
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
