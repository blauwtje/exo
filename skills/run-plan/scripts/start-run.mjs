#!/usr/bin/env node
// Finds the plan run-plan's step 1 should run: the file under docs/plans/,
// docs/specs/ or ~/.claude/plans/ whose `Repository:` line equals the
// checkout's toplevel, preferring one whose `Branch:` line equals the
// current branch, exactly as run-plan's SKILL.md describes. Writes step 1's
// four-line `exo/run-plan.active` marker and runs scratch-exclude.mjs, so a
// session that opens on a plan reaches its first dispatch in one command
// instead of picking the plan and writing the marker by hand.
//
//   node start-run.mjs [--root <checkout>] [--checkout <run-checkout>] [--session <id>]
//
// Prints the picked plan's absolute path, or exits 1 with one line when zero
// or several plans match.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { frameOf, parsePlan, PlanError } from '#plan-tasks';

const PLAN_DIRECTORIES = ['docs/plans', 'docs/specs'];
const SCRATCH_EXCLUDE = fileURLToPath(new URL('../../../lib/scratch-exclude.mjs', import.meta.url));

/** No plan matches, or more than one does after the branch preference: the caller exits 1. */
export class NoPlanError extends Error {}

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
// define-scope writes a plan.
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

/** The plan to run for `root`, or throws `NoPlanError` naming why none is picked. */
export function resolvePlan(root) {
  const repository = gitLine(root, ['rev-parse', '--show-toplevel']);
  const branch = gitLine(root, ['branch', '--show-current']);
  const candidates = candidatePlans(root, repository);
  if (candidates.length === 0) {
    throw new NoPlanError(`no plan under docs/plans/, docs/specs/ or ~/.claude/plans/ names Repository: ${repository}`);
  }
  const picked = pickPlans(candidates, branch);
  if (picked.length > 1) {
    throw new NoPlanError(`${picked.length} plans name Repository: ${repository}: ${picked.map((plan) => plan.file).join(', ')}`);
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
  fs.writeFileSync(path.join(markerDirectory, 'run-plan.active'), markerContent(planPath, checkout, sessionId));
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', checkout: 'value', session: 'value' });
  const root = flags.root ?? process.cwd();
  const planPath = resolvePlan(root);
  writeMarker(root, planPath, flags.checkout ?? root, flags.session ?? process.env.CLAUDE_SESSION_ID ?? '');
  execFileSync(process.execPath, [SCRATCH_EXCLUDE], { cwd: root });
  process.stdout.write(`${planPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`start-run: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof NoPlanError) {
      process.stderr.write(`start-run: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
