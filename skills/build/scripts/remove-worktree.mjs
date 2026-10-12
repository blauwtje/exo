import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';

export class RemoveWorktreeError extends Error {}

const SPECS = 'docs/specs';

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

function untrackedFiles(worktree, folder) {
  const args = ['-C', worktree, 'status', '--porcelain', '-z', '--ignored=traditional', '--untracked-files=all', '--', folder];
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter((line) => line.startsWith('?? ') || line.startsWith('!! '))
    .map((line) => line.slice(3))
    .filter((entry) => entry.startsWith(`${folder}/`))
    .map((entry) => entry.slice(folder.length + 1));
}

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
  const ownsKept = kept || briefs.length > 0;
  let movedTo;
  if (ownsKept && fs.existsSync(keptRoot)) {
    try {
      movedTo = moveAside(keptRoot);
    } catch (error) {
      throw new RemoveWorktreeError(`moving '${keptTarget}' aside failed: ${error.message}; removed nothing`);
    }
  }
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

function refuseMissed(worktree, folder, listed, copied) {
  const copiedSet = new Set(copied);
  const missed = listed.filter((relative) => !copiedSet.has(relative));
  if (missed.length > 0) {
    throw new RemoveWorktreeError(`'${worktree}' still holds uncopied ${folder} file(s): ${missed.join(', ')}`);
  }
}

function copyChecked({ worktree, exo, keptRoot, keptTarget, briefs }) {
  const exoCopied = copyFiles(exoFiles(worktree), path.join(worktree, '.exo'), exo.root, { from: `${worktree}/.exo/`, to: exo.target });
  const briefsCopied = copyFiles(briefs, path.join(worktree, SPECS), path.join(keptRoot, SPECS), { from: `${worktree}/${SPECS}/`, to: `${keptTarget}${SPECS}/` });
  refuseMissed(worktree, '.exo/', untrackedFiles(worktree, '.exo'), exoCopied);
  refuseMissed(worktree, `${SPECS}/`, untrackedFiles(worktree, SPECS), briefsCopied);
  return { exo: exoCopied, briefs: briefsCopied };
}

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
