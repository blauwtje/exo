#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { blockReport, runRules } from './next-task.mjs';
import { planCheckReport } from '../../spec/scripts/plan-check.mjs';
import { frameOf, landedTasks, openPoints, parsePlan, planIdOf, PlanError } from '#plan-tasks';
import { pruneBuildProgress, writeBuildProgress } from '#build-progress';

const PLAN_DIRECTORIES = ['docs/plans', 'docs/specs'];
const SCRATCH_EXCLUDE = fileURLToPath(new URL('../../../lib/scratch-exclude.mjs', import.meta.url));
const PLAN_CHECK = fileURLToPath(new URL('../../spec/scripts/plan-check.mjs', import.meta.url));
const USAGE = 'usage: node start-run.mjs --find-only | --plan <path> --checkout <run-checkout> [--root <checkout>]';
const HELP = [
  'usage: node start-run.mjs [--root <checkout>] [--checkout <run-checkout>] [--plan <path>] [--find-only]',
  '--plan names the plan the user gave, which skips the search.',
  "--find-only prints the picked plan's absolute path, then its `Repository:` and `Branch:` lines (`none` when absent).",
  'The starting call prints one `run started` line naming the plan, checkout and branch, then `next-task.mjs --block` output when the checkout is on the plan\'s Branch: or the plan names none.',
  'A refusal (zero or several plans, a --checkout that is not a checkout, a plan failing plan-check --loop --run) exits 1 with one line naming the cause and the next command.',
].join('\n');

export class RefusalError extends Error {}

function gitLine(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function planFrame(file) {
  try {
    return frameOf(parsePlan(fs.readFileSync(file, 'utf8')).frame);
  } catch (error) {
    if (error instanceof PlanError) return null;
    throw error;
  }
}

export function candidatePlans(root, repository) {
  const directories = [...PLAN_DIRECTORIES.map((dir) => path.join(root, dir)), path.join(os.homedir(), '.claude', 'plans')];
  return directories.flatMap(markdownFiles)
    .map((file) => ({ file, frame: planFrame(file) }))
    .filter(({ frame }) => frame !== null && frame.repository === repository);
}

export function pickPlans(candidates, branch) {
  const onBranch = candidates.filter(({ frame }) => frame.branch === branch);
  return onBranch.length > 0 ? onBranch : candidates;
}

export function resolvePlan(root) {
  const repository = gitLine(root, ['rev-parse', '--show-toplevel']);
  // why: git branch --show-current prints an empty line on a detached HEAD.
  const branch = gitLine(root, ['branch', '--show-current']);
  const candidates = candidatePlans(root, repository);
  if (candidates.length === 0) {
    throw new RefusalError(`no plan under docs/plans/, docs/specs/ or ~/.claude/plans/ names Repository: ${repository}. Next: rerun with --plan <path> naming the plan.`);
  }
  const picked = pickPlans(candidates, branch);
  if (picked.length > 1) {
    throw new RefusalError(`${picked.length} plans name Repository: ${repository}: ${picked.map((plan) => plan.file).join(', ')}. Next: ask which plan runs, then rerun with --plan <that path>.`);
  }
  return picked[0].file;
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', checkout: 'value', plan: 'value', 'find-only': 'boolean' }, { usage: HELP });
  const root = flags.root ?? process.cwd();
  const planPath = flags.plan ? path.resolve(flags.plan) : resolvePlan(root);
  if (flags['find-only']) {
    const frame = planFrame(planPath);
    process.stdout.write(`${planPath}\nRepository: ${frame?.repository ?? 'none'}\nBranch: ${frame?.branch ?? 'none'}\n`);
    return;
  }
  const open = planFrame(planPath) === null ? [] : openPoints(fs.readFileSync(planPath, 'utf8'));
  if (open.length > 0) {
    throw new RefusalError(`${planPath} has ${open.length} unanswered '## Open points': ${open.join('; ')}. Next: ask the user each one, record the answers in the brief, then rerun.`);
  }
  const checkout = flags.checkout ?? root;
  const branch = checkoutBranch(checkout);
  if (planFrame(planPath) !== null) requirePlanCheck(planPath, checkout);
  execFileSync(process.execPath, [SCRATCH_EXCLUDE], { cwd: root });
  const frame = planFrame(planPath);
  if (frame !== null) fs.writeFileSync(scratchPath(checkout, 'run-rules.md'), runRules(frame));
  const onBranch = branch === '' ? 'detached HEAD' : `branch ${branch}`;
  process.stdout.write(`start-run: run started: plan ${planPath}, checkout ${checkout} on ${onBranch}. Step 1 is done; never rerun start-run in this run.\n`);
  if (frame !== null) recordProgress(planPath, checkout);
  const planBranch = frame?.branch;
  if (planBranch && planBranch !== branch) {
    const switchArgs = branchExists(checkout, planBranch) ? planBranch : `-c ${planBranch}`;
    process.stdout.write(`start-run: note: checkout ${checkout} is on ${branch || 'detached HEAD'}, not the plan's Branch: ${planBranch}. If the workspace answer is ${planBranch}, run \`git -C ${checkout} switch ${switchArgs}\` and do not rerun start-run.\n`);
    return;
  }
  if (frame !== null) process.stdout.write(firstBlock(planPath, checkout));
}

// why: the status line reads this record; a failure here must never fail the run start.
function recordProgress(planPath, checkout) {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId || process.env.EXO_RUN_TASK) return;
  try {
    const { tasks } = parsePlan(fs.readFileSync(planPath, 'utf8'));
    const landed = landedTasks(tasks, checkout, planIdOf(planPath)).length;
    writeBuildProgress({ sessionId, plan: planPath, checkout: path.resolve(checkout), landed, total: tasks.length });
    pruneBuildProgress();
  } catch {
    return;
  }
}

function firstBlock(planPath, checkout) {
  try {
    return blockReport({ planPath, planText: fs.readFileSync(planPath, 'utf8'), root: checkout });
  } catch (error) {
    if (error instanceof PlanError) return '';
    throw error;
  }
}

function requirePlanCheck(planPath, checkout) {
  const report = planCheckReport(fs.readFileSync(planPath, 'utf8'), { root: checkout, loop: true, planPath, run: true });
  if (report.ok) return;
  throw new RefusalError(`plan-check --loop --run fails on ${planPath}:\n${report.lines.join('\n')}\nNext: fix the plan, confirm with \`node ${PLAN_CHECK} --loop --run --plan ${planPath} --root ${checkout}\`, then rerun start-run.`);
}

function checkoutBranch(checkout) {
  try {
    return execFileSync('git', ['-C', checkout, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new RefusalError(`--checkout ${checkout} is not a git checkout. Next: create it as the workspace answer says, then rerun with --checkout <that path>.`);
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
