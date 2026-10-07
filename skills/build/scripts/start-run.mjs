#!/usr/bin/env node
// Finds the plan build's step 1 should run: the file under docs/plans/,
// docs/specs/ or ~/.claude/plans/ whose `Repository:` line equals the
// checkout's toplevel, preferring one whose `Branch:` line equals the
// current branch, exactly as build's SKILL.md describes. Writes step 1's
// four-line `exo/build.active` marker and runs scratch-exclude.mjs, so a
// session that opens on a plan reaches its first dispatch in one command
// instead of picking the plan and writing the marker by hand.
//
//   node start-run.mjs [--root <checkout>] [--checkout <run-checkout>] [--session <id>] [--plan <path>] [--find-only]
//
// `--plan` names the plan the user gave, which skips the search.
// `--find-only` only resolves and prints the plan, writing no marker: the
// workspace decision reads the plan's `Repository:` and `Branch:` lines
// before the run's checkout is known, so it runs before the marker-writing
// call.
// `--find-only` prints the picked plan's absolute path. The marker-writing
// call prints one `run started` line naming the plan, checkout, branch and
// session, plus a note when the checkout's branch is not the plan's
// `Branch:`. A refusal (zero or several plans, a `--checkout` that is not a
// checkout) exits 1 with one line naming the cause and the next command.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf, parsePlan, PlanError } from '#plan-tasks';

const PLAN_DIRECTORIES = ['docs/plans', 'docs/specs'];
const SCRATCH_EXCLUDE = fileURLToPath(new URL('../../../lib/scratch-exclude.mjs', import.meta.url));
const USAGE = 'usage: node start-run.mjs --find-only | --plan <path> --checkout <run-checkout> [--session <id>] [--root <checkout>]';

/** No plan matches, several do, or the run checkout is no checkout: the caller exits 1 and writes no marker. */
export class RefusalError extends Error {}

function gitLine(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

// Every `.md` file under `directory`, or none when it does not exist.
function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// The frame's fields of one plan file, or null when it does not parse as
// spec writes a plan.
function planFrame(file) {
  try {
    return frameOf(parsePlan(fs.readFileSync(file, 'utf8')).frame);
  } catch (error) {
    if (error instanceof PlanError) return null;
    throw error;
  }
}

/** Every plan under the three plan folders whose `Repository:` line equals `repository`. */
export function candidatePlans(root, repository) {
  const directories = [...PLAN_DIRECTORIES.map((dir) => path.join(root, dir)), path.join(os.homedir(), '.claude', 'plans')];
  return directories.flatMap(markdownFiles)
    .map((file) => ({ file, frame: planFrame(file) }))
    .filter(({ frame }) => frame !== null && frame.repository === repository);
}

/** Every candidate whose `Branch:` equals `branch`, when any do, else every candidate. */
export function pickPlans(candidates, branch) {
  const onBranch = candidates.filter(({ frame }) => frame.branch === branch);
  return onBranch.length > 0 ? onBranch : candidates;
}

/** The plan to run for `root`, or throws `RefusalError` naming why none is picked. */
export function resolvePlan(root) {
  const repository = gitLine(root, ['rev-parse', '--show-toplevel']);
  const branch = gitLine(root, ['branch', '--show-current']);
  const candidates = candidatePlans(root, repository);
  if (candidates.length === 0) {
    throw new RefusalError(`no plan under docs/plans/, docs/specs/ or ~/.claude/plans/ names Repository: ${repository}; no marker written. Next: rerun with --plan <path> naming the plan.`);
  }
  const picked = pickPlans(candidates, branch);
  if (picked.length > 1) {
    throw new RefusalError(`${picked.length} plans name Repository: ${repository}: ${picked.map((plan) => plan.file).join(', ')}; no marker written. Next: ask which plan runs, then rerun with --plan <that path>.`);
  }
  return picked[0].file;
}

// Step 1's marker: the plan's absolute path, the run's checkout, the session
// id and the write time, one per line, in that order.
function markerContent(planPath, checkout, sessionId) {
  return `${planPath}\n${checkout}\n${sessionId}\n${new Date().toISOString()}\n`;
}

function writeMarker(root, planPath, checkout, sessionId) {
  const gitDirectory = gitLine(root, ['rev-parse', '--absolute-git-dir']);
  const markerDirectory = path.join(gitDirectory, 'exo');
  fs.mkdirSync(markerDirectory, { recursive: true });
  fs.writeFileSync(path.join(markerDirectory, 'build.active'), markerContent(planPath, checkout, sessionId));
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', checkout: 'value', session: 'value', plan: 'value', 'find-only': 'boolean' });
  const root = flags.root ?? process.cwd();
  const planPath = flags.plan ? path.resolve(flags.plan) : resolvePlan(root);
  if (flags['find-only']) {
    process.stdout.write(`${planPath}\n`);
    return;
  }
  const checkout = flags.checkout ?? root;
  const branch = checkoutBranch(checkout);
  // An empty `--session` is an unset shell variable, so it falls through too.
  const sessionId = flags.session || process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || '';
  writeMarker(root, planPath, checkout, sessionId);
  execFileSync(process.execPath, [SCRATCH_EXCLUDE], { cwd: root });
  const onBranch = branch === '' ? 'detached HEAD' : `branch ${branch}`;
  process.stdout.write(`start-run: run started, marker written: plan ${planPath}, checkout ${checkout} on ${onBranch}, session ${sessionId || 'none'}. Step 1 is done; never rerun start-run in this run.\n`);
  const planBranch = planFrame(planPath)?.branch;
  if (planBranch && planBranch !== branch) {
    const switchArgs = branchExists(checkout, planBranch) ? planBranch : `-c ${planBranch}`;
    process.stdout.write(`start-run: note: checkout ${checkout} is on ${branch || 'detached HEAD'}, not the plan's Branch: ${planBranch}. The marker names no branch, so if the workspace answer is ${planBranch}, run \`git -C ${checkout} switch ${switchArgs}\` and do not rerun start-run.\n`);
  }
}

// The run checkout's current branch, empty on a detached HEAD, or a
// refusal when the path is no git checkout.
function checkoutBranch(checkout) {
  try {
    return execFileSync('git', ['-C', checkout, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new RefusalError(`--checkout ${checkout} is not a git checkout; no marker written. Next: create it as the workspace answer says, then rerun with --checkout <that path>.`);
  }
}

function branchExists(checkout, branch) {
  try {
    execFileSync('git', ['-C', checkout, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`start-run: ${error.message}\n${USAGE}\n`);
      process.exitCode = 2;
    } else if (error instanceof RefusalError) {
      process.stderr.write(`start-run: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
