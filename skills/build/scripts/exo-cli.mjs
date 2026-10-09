#!/usr/bin/env node
// The terminal front of run-plan.mjs.
//
//   node exo-cli.mjs run [plan] [run-plan flags]
//
// Works from the git root of the cwd. With no plan it takes the newest
// docs/specs/*.md that is not a *-decisions.md file. It refuses a checkout with
// uncommitted edits (exit 2), puts the checkout on the plan's Branch: (created
// from the default branch when missing), then runs run-plan.mjs with inherited
// stdio and exits with its code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultBranch, frameOf, parsePlan } from '#plan-tasks';
import { isMain } from '#script-flags';

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
    if (command !== 'run') throw new Refusal('usage: exo run [plan] [run-plan flags]');
    process.exitCode = runCommand(rest);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
