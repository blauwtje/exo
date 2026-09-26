#!/usr/bin/env node
// Ends a run-plan session's step 7 tail: takes the merge-base with
// `origin/<default>` the way ship.mjs reads the default branch and runs
// pick-reviewer.mjs on that base exactly as run-plan's SKILL.md does.
// `--done` instead removes step 1's `run-plan.active` marker, which the
// skill runs only once the review, its fixes and the final verification
// landed, so the hooks keep resuming the run until then.
//
//   node finish-run.mjs [--root <checkout>] [--reviewer <name>]
//   node finish-run.mjs --done [--root <checkout>]
//
// Prints the reviewer pick-reviewer.mjs picked and a `base=<sha>` line, or
// exits 1 with one line when the default branch or the merge-base cannot
// be read.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseFlags, UsageError } from '#script-flags';

const PICK_REVIEWER = fileURLToPath(new URL('./pick-reviewer.mjs', import.meta.url));

/** The default branch or the merge-base cannot be read: the caller exits 1. */
export class FinishRunError extends Error {}

function gitLine(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** The branch `refs/remotes/origin/HEAD` names, its `origin/` remote stripped, as ship.mjs reads it. */
export function defaultBranch(root) {
  const ref = gitLine(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return ref === null ? null : ref.replace(/^origin\//, '');
}

function firstLine(text) {
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').trim();
}

function markerPath(root) {
  const gitDirectory = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  return path.join(gitDirectory, 'exo', 'run-plan.active');
}

/** Runs pick-reviewer.mjs as a subprocess and returns its one stdout line. */
export function reviewerFor(root, { base, reviewer }) {
  const args = reviewer !== undefined ? ['--reviewer', reviewer] : ['--base', base];
  const result = spawnSync(process.execPath, [PICK_REVIEWER, ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new FinishRunError(`pick-reviewer: ${firstLine(result.stderr || result.stdout || 'failed')}`);
  return firstLine(result.stdout);
}

/** The reviewer line and the merge-base for `root`'s branch review; step 1's marker is untouched. */
export function finishRun(root, { reviewer } = {}) {
  const branch = defaultBranch(root);
  if (branch === null) throw new FinishRunError('no default branch: refs/remotes/origin/HEAD is unset');
  const base = gitLine(root, ['merge-base', 'HEAD', `origin/${branch}`]);
  if (base === null) throw new FinishRunError(`no merge base with origin/${branch}`);
  const line = reviewerFor(root, { base, reviewer });
  return { line, base };
}

/** Removes step 1's `run-plan.active` marker; a missing marker is not an error. */
export function finishRunDone(root) {
  fs.rmSync(markerPath(root), { force: true });
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', reviewer: 'value', done: 'boolean' });
  const root = flags.root ?? process.cwd();
  if (flags.done) {
    finishRunDone(root);
    return;
  }
  const { line, base } = finishRun(root, { reviewer: flags.reviewer });
  process.stdout.write(`${line}\nbase=${base}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`finish-run: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof FinishRunError) {
      process.stderr.write(`finish-run: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
