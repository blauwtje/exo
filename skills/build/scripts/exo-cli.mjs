#!/usr/bin/env node
// The terminal front of run-plan.mjs.
//
//   node exo-cli.mjs run [plan] [run-plan flags]
//   node exo-cli.mjs run config [<key> <value>]
//   node exo-cli.mjs setup
//
// `setup` writes the ~/.local/bin/exo launcher; `run config` shows or sets the
// personal run.json.
//
// Works from the git root of the cwd. With no plan it takes the newest
// docs/specs/*.md that is not a *-decisions.md file. It refuses a checkout with
// uncommitted edits (exit 2), puts the checkout on the plan's Branch: (created
// from the default branch when missing), then runs run-plan.mjs with inherited
// stdio and exits with its code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, frameOf, parsePlan } from '#plan-tasks';
import { isMain } from '#script-flags';
import { configDir, loadRunConfig, readKeys } from './run-config.mjs';

const RUN_PLAN = fileURLToPath(new URL('./run-plan.mjs', import.meta.url));

class Refusal extends Error {}

function gitOut(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

/** The docs/specs/*.md with the newest mtime that does not end in -decisions.md; null with none. */
function newestPlan(root) {
  const folder = path.join(root, 'docs', 'specs');
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return null;
  }
  const plans = names
    .filter((name) => name.endsWith('.md') && !name.endsWith('-decisions.md'))
    .map((name) => ({ file: path.join(folder, name), time: fs.statSync(path.join(folder, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return plans[0]?.file ?? null;
}

function dirtyFiles(root) {
  const answer = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.split('\n').filter(Boolean).map((line) => line.slice(3)) : [];
}

function putOnBranch(root, wanted) {
  if (gitOut(root, ['symbolic-ref', '-q', '--short', 'HEAD']) === wanted) return;
  const exists = gitOut(root, ['rev-parse', '-q', '--verify', `refs/heads/${wanted}`]) !== null;
  let args = ['switch', wanted];
  if (!exists) {
    const base = defaultBranch(root);
    if (base === null) throw new Refusal(`branch ${wanted} is missing and the checkout has no default branch to create it from`);
    args = ['switch', '-c', wanted, base];
  }
  const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (done.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${done.stderr.trim()}`);
}

const LAUNCHER = [
  '#!/bin/sh',
  'root=$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root") && exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"',
  ''
].join('\n');

function setupCommand() {
  const home = os.homedir();
  const bin = path.join(home, '.local', 'bin');
  const target = path.join(bin, 'exo');
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== LAUNCHER) {
    throw new Refusal(`refused: ${target} already exists and is not the exo launcher; move it, then rerun exo setup`);
  }
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(target, LAUNCHER, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  fs.mkdirSync(configDir(home), { recursive: true });
  process.stdout.write([
    `exo: launcher ${target}`,
    `exo: keys file ${path.join(configDir(home), 'keys.env')}; copy in the lines for the providers you use:`,
    'DEEPSEEK_API_KEY=',
    'ZAI_API_KEY=',
    ''
  ].join('\n'));
  if (!(process.env.PATH ?? '').split(path.delimiter).includes(bin)) {
    process.stdout.write(`exo: warning: ${bin} is not on PATH; add it to your shell profile\n`);
  }
}

/** Leaf settings as [dotted path, value] pairs; arrays are leaves. */
function leaves(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
}

function has(object, dotted) {
  let at = object;
  for (const key of dotted.split('.')) {
    if (at === null || typeof at !== 'object' || !(key in at)) return false;
    at = at[key];
  }
  return true;
}

function readUserConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Refusal(`cannot read ${file}: ${error.message}`);
  }
}

function configCommand(args) {
  const home = os.homedir();
  const file = path.join(configDir(home), 'run.json');
  if (args.length === 0) {
    const user = readUserConfig(file);
    const merged = loadRunConfig({ home });
    for (const [key, value] of leaves(merged)) {
      process.stdout.write(`${key} = ${JSON.stringify(value)} (${has(user, key) ? 'run.json' : 'catalog'})\n`);
    }
    const keys = readKeys(path.join(configDir(home), 'keys.env'));
    for (const [name, entry] of Object.entries(merged.providers)) {
      if (entry.key) process.stdout.write(`key ${entry.key} (${name}): ${keys[entry.key] ? 'set' : 'missing'}\n`);
    }
    return;
  }
  if (args.length !== 2) throw new Refusal('usage: exo run config [<key> <value>]');
  const [key, raw] = args;
  let value = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // not JSON: keep the text
  }
  const user = readUserConfig(file);
  user[key] = value;
  fs.mkdirSync(configDir(home), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(user, null, 2)}\n`);
  process.stdout.write(`exo: ${key} = ${JSON.stringify(value)} written to ${file}\n`);
}

function runCommand(argv) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  const given = argv[0] !== undefined && !argv[0].startsWith('--');
  const flags = given ? argv.slice(1) : argv;
  const plan = given ? path.resolve(argv[0]) : newestPlan(root);
  if (plan === null) throw new Refusal('no plan under docs/specs/; pass one: exo run <plan>');
  if (!given) process.stdout.write(`exo: plan ${plan}\n`);

  const files = dirtyFiles(root);
  if (files.length > 0) {
    const list = files.join(' ');
    throw new Refusal(`refused: uncommitted edits in ${list}; commit them, or discard with git restore --staged --worktree -- ${list}`);
  }

  let branch;
  try {
    branch = frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).branch;
  } catch (error) {
    throw new Refusal(`cannot read ${plan}: ${error.message}`);
  }
  if (branch !== null) putOnBranch(root, branch);

  return spawnSync(process.execPath, [RUN_PLAN, plan, ...flags], { cwd: root, stdio: 'inherit' }).status ?? 1;
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'setup') setupCommand();
    else if (command === 'run' && rest[0] === 'config') configCommand(rest.slice(1));
    else if (command === 'run') process.exitCode = runCommand(rest);
    else throw new Refusal('usage: exo run [plan] [run-plan flags] | exo run config [<key> <value>] | exo setup');
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
