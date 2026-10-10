// Removes a wave worktree only after its `.exo/` build report is safe in the
// run's checkout: a worktree's `.exo/` never rides `git worktree remove`, and
// a report left behind because a copy silently missed a file is worse than a
// worktree left behind, since the next turn cannot tell the report was lost.
// `--worktree <path> --run <checkout>` copies every file under the
// worktree's `.exo/` into the run's `.exo/`, then removes the worktree; it
// refuses and removes nothing when a copy fails or when the worktree's
// ignored files still list a `.exo/` path this run did not copy.
// A spec brief at `docs/specs/<topic>.md` is often ignored or untracked, so
// `git worktree remove` deletes it too: every file under the worktree's
// `docs/specs/` that git does not track goes the same way to `docs/specs/`
// inside the kept folder, `<run>/.exo/kept/<worktree basename>/`, checked
// against git's own list; a tracked one stays with git.
// `--kept` copies the `.exo/` files into the kept folder instead, so
// many worktrees removed into one checkout keep their same-named files apart
// and leave the run's own `.exo/` alone. When this call
// writes that kept folder (`--kept`, or a brief to keep) and it already exists,
// it first moves it aside to `<worktree basename>-<UTC date-time>/` (`-2`,
// `-3`, ... when that name is taken too), so no kept file is ever overwritten,
// and on any refusal it drops the new folder and moves the old one back,
// unless git already deleted a file the new folder copied, when both stay.
// `--report <file>` refuses while that file is absent: the wave's build writes
// its report last, so an absent one means the build has not returned. A dirty
// worktree goes only with `--patch <file>`, a non-empty file holding its work;
// there is no `--force`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';

/** The build report is absent, the patch file is absent or empty, moving an existing kept folder aside failed, a copy into the run's `.exo/` failed, the worktree still holds an uncopied `.exo/` file or an uncopied `docs/specs/` file git does not track, or git refused the removal: nothing was removed, and a moved kept folder is back under its own name, unless git removed part of the worktree, when the kept folder and a moved one stay. */
export class RemoveWorktreeError extends Error {}

// Where the spec skill writes a brief, relative to the checkout root.
const SPECS = 'docs/specs';

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

// Every file under the worktree's `<folder>/` that git does not track,
// ignored (`!!`) or untracked (`??`), as a path relative to `<folder>/`: the
// worktree's own list, the ground truth for what a plain file walk could have
// missed (a symlink, a file created mid-copy, a permission git can see but fs
// cannot). `--ignored=traditional` with `--untracked-files=all` lists each
// file inside an ignored or untracked directory, where `matching` or the
// default would give only the one directory entry, such as the excluded
// `.exo/`; the pathspec keeps the walk to `<folder>/`. A tracked file is left
// out: git keeps it in the branch. `-z` keeps a name with a space or
// non-ASCII byte unquoted.
function untrackedFiles(worktree, folder) {
  const args = ['-C', worktree, 'status', '--porcelain', '-z', '--ignored=traditional', '--untracked-files=all', '--', folder];
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter((line) => line.startsWith('?? ') || line.startsWith('!! '))
    .map((line) => line.slice(3))
    .filter((entry) => entry.startsWith(`${folder}/`))
    .map((entry) => entry.slice(folder.length + 1));
}

// Moves `folder` to `<folder>-<UTC date-time>`, with `-2`, `-3`, ... added
// until the name is free, and returns the new path. The stamp has no colons,
// so it is a valid Windows file name, and sorts by time.
function moveAside(folder) {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  let target = `${folder}-${stamp}`;
  for (let suffix = 2; fs.existsSync(target); suffix += 1) target = `${folder}-${stamp}-${suffix}`;
  fs.renameSync(folder, target);
  return target;
}

export function removeWorktree({ worktree, run, report, patch, kept = false }) {
  if (report !== undefined && !fs.existsSync(report)) {
    throw new RemoveWorktreeError(`build report '${report}' is absent, so the build has not returned; removed nothing`);
  }
  if (patch !== undefined && !(fs.existsSync(patch) && fs.statSync(patch).size > 0)) {
    throw new RemoveWorktreeError(`patch '${patch}' is absent or empty, so the worktree's work is not saved; removed nothing`);
  }
  const keptRoot = path.join(run, '.exo', 'kept', path.basename(worktree));
  const keptTarget = `${keptRoot}/`;
  const briefs = untrackedFiles(worktree, SPECS);
  const exo = kept ? { root: keptRoot, target: keptTarget } : { root: path.join(run, '.exo'), target: `${run}/.exo/` };
  // This call owns the kept folder when it writes there, with `--kept` or for
  // a brief; both modes share the move-aside below and the rollback after it.
  const ownsKept = kept || briefs.length > 0;
  let movedTo;
  if (ownsKept && fs.existsSync(keptRoot)) {
    try {
      movedTo = moveAside(keptRoot);
    } catch (error) {
      throw new RemoveWorktreeError(`moving '${keptTarget}' aside failed: ${error.message}; removed nothing`);
    }
  }
  // The kept folder at `keptRoot` is this call's own (any earlier one was
  // moved aside above), so a refusal drops it and moves the earlier one back:
  // a retry then sees the state from before this call.
  const rollBack = () => {
    if (!ownsKept) return;
    fs.rmSync(keptRoot, { recursive: true, force: true });
    if (movedTo !== undefined) fs.renameSync(movedTo, keptRoot);
  };
  let copied;
  try {
    copied = copyChecked({ worktree, exo, keptRoot, keptTarget, briefs });
  } catch (error) {
    rollBack();
    throw error;
  }
  const failure = gitRemoveFailure({ worktree, run, discard: patch !== undefined });
  if (failure !== undefined) {
    // Git can fail after deleting part of the worktree: once a file copied
    // into `keptRoot` is gone there, that copy is the only one left, so it
    // stays, and the earlier folder keeps its stamped name.
    const keptSources = [
      ...copied.briefs.map((relative) => path.join(worktree, SPECS, relative)),
      ...(kept ? copied.exo.map((relative) => path.join(worktree, '.exo', relative)) : []),
    ];
    if (!keptSources.every((source) => fs.existsSync(source))) {
      const earlier = movedTo === undefined ? '' : `; the earlier one stays in '${movedTo}/'`;
      throw new RemoveWorktreeError(`git removed part of '${worktree}' and then failed: ${failure}; the copy stays in '${keptTarget}'${earlier}`);
    }
    rollBack();
    throw new RemoveWorktreeError(`git refused to remove '${worktree}': ${failure}`);
  }
  const counts = { exo: copied.exo.length, briefs: copied.briefs.length };
  const briefNote = counts.briefs === 0 ? '' : `; kept ${counts.briefs} ${SPECS}/ file(s) in '${keptTarget}${SPECS}/'`;
  const moved = movedTo === undefined ? '' : `; moved existing '${keptTarget}' to '${movedTo}/'`;
  return `Copied ${counts.exo} .exo/ file(s) from '${worktree}' to '${kept ? keptTarget : run}'${briefNote}${moved}; removed '${worktree}'\n`;
}

// Copies each relative path from under `source` to the same path under
// `destination` and returns the copied list; any failure becomes a
// RemoveWorktreeError naming the two labels.
function copyFiles(relatives, source, destination, labels) {
  const copied = [];
  try {
    for (const relative of relatives) {
      const to = path.join(destination, relative);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(source, relative), to);
      copied.push(relative);
    }
  } catch (error) {
    throw new RemoveWorktreeError(`copying '${labels.from}' to '${labels.to}' failed: ${error.message}`);
  }
  return copied;
}

// Refuses when git's own list, read after copying, names a file under
// `folder` that the copy did not take.
function refuseMissed(worktree, folder, listed, copied) {
  const copiedSet = new Set(copied);
  const missed = listed.filter((relative) => !copiedSet.has(relative));
  if (missed.length > 0) {
    throw new RemoveWorktreeError(`'${worktree}' still holds uncopied ${folder} file(s): ${missed.join(', ')}`);
  }
}

// Copies the worktree's `.exo/` files under `exo.root` and its untracked
// `docs/specs/` files under the kept folder, checks git sees none left
// uncopied, and returns both copied lists.
function copyChecked({ worktree, exo, keptRoot, keptTarget, briefs }) {
  const exoCopied = copyFiles(exoFiles(worktree), path.join(worktree, '.exo'), exo.root, { from: `${worktree}/.exo/`, to: exo.target });
  const briefsCopied = copyFiles(briefs, path.join(worktree, SPECS), path.join(keptRoot, SPECS), { from: `${worktree}/${SPECS}/`, to: `${keptTarget}${SPECS}/` });
  refuseMissed(worktree, '.exo/', untrackedFiles(worktree, '.exo'), exoCopied);
  refuseMissed(worktree, `${SPECS}/`, untrackedFiles(worktree, SPECS), briefsCopied);
  return { exo: exoCopied, briefs: briefsCopied };
}

// Runs `git worktree remove` and returns the first line of git's error, or
// undefined once the worktree is removed.
function gitRemoveFailure({ worktree, run, discard }) {
  const args = ['-C', run, 'worktree', 'remove', ...(discard ? ['--force'] : []), worktree];
  try {
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return String(error.stderr ?? error.message).split('\n')[0];
  }
  return undefined;
}

function main(argv) {
  const flags = parseFlags(argv, { worktree: 'value', run: 'value', report: 'value', patch: 'value', kept: 'boolean' });
  if (flags.worktree === undefined) throw new UsageError("flag '--worktree' names the worktree to remove");
  if (flags.run === undefined) throw new UsageError("flag '--run' names the run's checkout");
  process.stdout.write(removeWorktree({ worktree: flags.worktree, run: flags.run, report: flags.report, patch: flags.patch, kept: flags.kept ?? false }));
}

if (isMain(import.meta.url)) {
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
