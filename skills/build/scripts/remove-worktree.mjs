// Removes a wave worktree only after its `.exo/` build report is safe in the
// run's checkout: a worktree's `.exo/` never rides `git worktree remove`, and
// a report left behind because a copy silently missed a file is worse than a
// worktree left behind, since the next turn cannot tell the report was lost.
// `--worktree <path> --run <checkout>` copies every file under the
// worktree's `.exo/` into the run's `.exo/`, then removes the worktree; it
// refuses and removes nothing when a copy fails or when the worktree's
// ignored files still list a `.exo/` path this run did not copy.
// `--kept` copies into `<run>/.exo/kept/<worktree basename>/` instead, so
// many worktrees removed into one checkout keep their same-named files apart
// and leave the run's own `.exo/` alone; it refuses and removes nothing when
// that folder already exists.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

/** A copy into the run's `.exo/` failed, the `--kept` folder already exists, the worktree still holds an uncopied `.exo/` file, or git refused the removal: nothing was removed. */
export class RemoveWorktreeError extends Error {}

// Every regular file under `<root>/.exo/`, as a path relative to `.exo/`
// itself, so the same relative path names both the source and the copy's
// destination.
function exoFiles(root) {
  const base = path.join(root, '.exo');
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  if (fs.existsSync(base)) walk(base, '');
  return files;
}

// `.exo/` is excluded, not ignored by a tracked `.gitignore`, so only
// `--ignored=matching` lists its individual files instead of collapsing them
// into the single `.exo/` directory entry; this reads the worktree's own
// ignored set, the ground truth for what a plain file walk could have missed
// (a file created mid-copy, a permission git can see but fs cannot). `-z`
// keeps a name with a space or non-ASCII byte unquoted.
function ignoredExoFiles(worktree) {
  const status = execFileSync('git', ['-C', worktree, 'status', '--porcelain', '-z', '--ignored=matching'], { encoding: 'utf8' });
  return status
    .split('\0')
    .map((line) => line.slice(3))
    .filter((entry) => entry.startsWith('.exo/') && entry !== '.exo/')
    .map((entry) => entry.slice('.exo/'.length));
}

export function removeWorktree({ worktree, run, force = false, kept = false }) {
  const destinationRoot = kept ? path.join(run, '.exo', 'kept', path.basename(worktree)) : path.join(run, '.exo');
  if (kept && fs.existsSync(destinationRoot)) {
    throw new RemoveWorktreeError(`'${destinationRoot}/' already exists; refusing to overwrite it, removed nothing`);
  }
  const copied = [];
  try {
    for (const relative of exoFiles(worktree)) {
      const destination = path.join(destinationRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(worktree, '.exo', relative), destination);
      copied.push(relative);
    }
  } catch (error) {
    const target = kept ? `${destinationRoot}/` : `${run}/.exo/`;
    throw new RemoveWorktreeError(`copying '${worktree}/.exo/' to '${target}' failed: ${error.message}`);
  }
  const copiedSet = new Set(copied);
  const missed = ignoredExoFiles(worktree).filter((relative) => !copiedSet.has(relative));
  if (missed.length > 0) {
    throw new RemoveWorktreeError(`'${worktree}' still holds uncopied .exo/ file(s): ${missed.join(', ')}`);
  }
  const args = ['-C', run, 'worktree', 'remove', ...(force ? ['--force'] : []), worktree];
  try {
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // The kept folder was created by this run (it did not exist above), so
    // drop it: left behind it would make the retry refuse as a duplicate.
    if (kept) fs.rmSync(destinationRoot, { recursive: true, force: true });
    const reason = String(error.stderr ?? error.message).split('\n')[0];
    throw new RemoveWorktreeError(`git refused to remove '${worktree}': ${reason}`);
  }
  const target = kept ? `${destinationRoot}/` : run;
  return `Copied ${copied.length} .exo/ file(s) from '${worktree}' to '${target}'; removed '${worktree}'\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { worktree: 'value', run: 'value', force: 'boolean', kept: 'boolean' });
  if (flags.worktree === undefined) throw new UsageError("flag '--worktree' names the worktree to remove");
  if (flags.run === undefined) throw new UsageError("flag '--run' names the run's checkout");
  process.stdout.write(removeWorktree({ worktree: flags.worktree, run: flags.run, force: flags.force ?? false, kept: flags.kept ?? false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`remove-worktree: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof RemoveWorktreeError) {
      process.stderr.write(`remove-worktree: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
