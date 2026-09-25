// Picks the branch-review agent by the size of the change (--base/--reviewer),
// or the review effort for an uncommitted fix (--effort), so a remark about
// budget, a deadline or how the diff reads never moves either pick: only a
// reviewer the caller names with --reviewer, or the numbers themselves, do.

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

export const FILE_LIMIT = 5;
export const LINE_LIMIT = 200;
const REVIEWERS = ['exo:review-branch', 'exo:review-branch-deep'];
const EFFORT_SKIP_FILE_LIMIT = 2;
export const MANIFESTS = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'requirements.txt', 'pyproject.toml', 'poetry.lock', 'uv.lock', 'Pipfile', 'Pipfile.lock',
  'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock',
  'composer.json', 'composer.lock', 'pom.xml', 'build.gradle', 'build.gradle.kts'
];

export function parseShortstat(output) {
  const files = Number(output.match(/(\d+) files? changed/)?.[1] ?? 0);
  const insertions = Number(output.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
  const deletions = Number(output.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
  return { files, changedLines: insertions + deletions };
}

export function pickReviewer({ files, changedLines }) {
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'exo:review-branch' : 'exo:review-branch-deep';
}

/** Sums a `git diff --numstat` listing; a binary line's `-` counts as no changed lines. */
export function parseNumstat(output) {
  let files = 0;
  let changedLines = 0;
  for (const line of output.split('\n')) {
    if (line === '') continue;
    const [added, deleted] = line.split('\t');
    files += 1;
    changedLines += (added === '-' ? 0 : Number(added)) + (deleted === '-' ? 0 : Number(deleted));
  }
  return { files, changedLines };
}

function pathsFromNumstat(output) {
  return output.split('\n').filter((line) => line !== '').map((line) => line.split('\t')[2]);
}

function countLines(content) {
  if (content === '') return 0;
  const lines = content.split('\n');
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/** Effort for the uncommitted fix against HEAD: tracked changes plus untracked new files. */
export function pickEffort({ files, changedLines, manifestChanged }) {
  if (files <= EFFORT_SKIP_FILE_LIMIT && !manifestChanged) return 'skip';
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'low' : 'medium';
}

function measureEffort() {
  const numstatOutput = execFileSync('git', ['diff', '--numstat', 'HEAD'], { encoding: 'utf8' });
  const tracked = parseNumstat(numstatOutput);
  const trackedPaths = pathsFromNumstat(numstatOutput);

  const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  const untrackedPaths = untrackedOutput.split('\0').filter((relativePath) => relativePath !== '');
  const untrackedLines = untrackedPaths.reduce((total, relativePath) => total + countLines(readFileSync(relativePath, 'utf8')), 0);

  const manifestChanged = [...trackedPaths, ...untrackedPaths].some((filePath) => MANIFESTS.includes(basename(filePath)));
  return pickEffort({
    files: tracked.files + untrackedPaths.length,
    changedLines: tracked.changedLines + untrackedLines,
    manifestChanged
  });
}

export function resolveReviewer({ reviewer, shortstatOutput }) {
  if (reviewer !== undefined) {
    if (!REVIEWERS.includes(reviewer)) throw new UsageError(`unknown reviewer '${reviewer}'`);
    return reviewer;
  }
  return pickReviewer(parseShortstat(shortstatOutput));
}

function main(argv) {
  const flags = parseFlags(argv, { base: 'value', reviewer: 'value', effort: 'boolean' });
  if (flags.effort) {
    if (flags.reviewer !== undefined || flags.base !== undefined) {
      throw new UsageError("flag '--effort' does not take '--reviewer' or '--base'");
    }
    process.stdout.write(`${measureEffort()}\n`);
    return;
  }
  const base = flags.base ?? '';
  // An empty base makes git read `...HEAD` as HEAD...HEAD, an empty diff that
  // would pick the light reviewer for a branch of any size.
  if (flags.reviewer === undefined && base === '') throw new UsageError("flag '--base' needs a revision");
  const shortstatOutput = flags.reviewer === undefined
    ? execFileSync('git', ['diff', '--shortstat', `${base}...HEAD`], { encoding: 'utf8' })
    : '';
  process.stdout.write(`${resolveReviewer({ reviewer: flags.reviewer, shortstatOutput })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`pick-reviewer: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
