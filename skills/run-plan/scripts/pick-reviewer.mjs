// Picks the branch-review agent by the size of the change (--base/--reviewer),
// or the review effort for an uncommitted fix (--effort), so a remark about
// budget, a deadline or how the diff reads never moves either pick: only a
// reviewer the caller names with --reviewer, or the numbers themselves, do.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
// A relative import, not the `#name` alias every other `lib/` import uses
// here: this task's scope excludes `package.json`, which holds that map.
import { measureSizeFacts, parseNumstat } from '#size-facts';

export const FILE_LIMIT = 5;
export const LINE_LIMIT = 200;
const REVIEWERS = ['exo:review-branch', 'exo:review-branch-deep'];
const EFFORT_SKIP_FILE_LIMIT = 2;
export { parseNumstat };

export function parseShortstat(output) {
  const files = Number(output.match(/(\d+) files? changed/)?.[1] ?? 0);
  const insertions = Number(output.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
  const deletions = Number(output.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
  return { files, changedLines: insertions + deletions };
}

export function pickReviewer({ files, changedLines }) {
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'exo:review-branch' : 'exo:review-branch-deep';
}

/** Effort for the uncommitted fix against HEAD: tracked changes plus untracked new files. */
export function pickEffort({ files, changedLines, manifestChanged }) {
  if (files <= EFFORT_SKIP_FILE_LIMIT && !manifestChanged) return 'skip';
  return files <= FILE_LIMIT && changedLines <= LINE_LIMIT ? 'low' : 'medium';
}

/** `lib/size-facts.mjs` holds the one count of files, lines and a dependency addition. */
function measureEffort() {
  const { files, changedLines, dependencyAdded } = measureSizeFacts();
  return pickEffort({ files, changedLines, manifestChanged: dependencyAdded });
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
