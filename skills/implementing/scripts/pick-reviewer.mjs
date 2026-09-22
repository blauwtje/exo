// Picks the branch-review agent by the size of the change, so a remark about
// budget, a deadline or how the diff reads never moves the pick: only a
// reviewer the caller names with --reviewer does that.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

const FILE_LIMIT = 5;
const LINE_LIMIT = 200;
const REVIEWERS = ['exo:branch-reviewer', 'exo:branch-reviewer-deep'];

export function parseShortstat(output) {
  const files = Number(output.match(/(\d+) files? changed/)?.[1] ?? 0);
  const insertions = Number(output.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
  const deletions = Number(output.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
  return { files, changedLines: insertions + deletions };
}

export function pickReviewer({ files, changedLines }) {
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'exo:branch-reviewer' : 'exo:branch-reviewer-deep';
}

export function resolveReviewer({ reviewer, shortstatOutput }) {
  if (reviewer !== undefined) {
    if (!REVIEWERS.includes(reviewer)) throw new UsageError(`unknown reviewer '${reviewer}'`);
    return reviewer;
  }
  return pickReviewer(parseShortstat(shortstatOutput));
}

function main(argv) {
  const flags = parseFlags(argv, { base: 'value', reviewer: 'value' });
  if (flags.reviewer === undefined && flags.base === undefined) throw new UsageError("flag '--base' is required");
  const shortstatOutput = flags.reviewer === undefined
    ? execFileSync('git', ['diff', '--shortstat', `${flags.base}...HEAD`], { encoding: 'utf8' })
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
