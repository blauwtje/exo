import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { coversCompanion, decisionsPathOf, isCovered, isPlanDoc, landedTasks, planIdOf } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { addedPathspecs } from './land-signatures.mjs';

// why: a git worktree nested in the checkout is another checkout, not task output.
export function nestedWorktrees(root) {
  const listed = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (listed.status !== 0) return new Set();
  return new Set(listed.stdout.split('\n').filter((line) => line.startsWith('worktree ')).flatMap((line) => {
    try { return [realpathSync(line.slice('worktree '.length))]; } catch { return []; } // why: a prunable worktree is listed after its directory is gone.
  }));
}

function untrackedPaths(root) {
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n')
    .filter((file) => file === '' || !worktrees.has(path.join(top, file.replace(/\/$/, ''))));
}

export function changedPaths(root, planPath) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const scratchPrefix = `${SCRATCH_FOLDER}/`;
  const exempt = planPath === undefined ? [] : [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  return [...new Set([...tracked.split('\n'), ...untrackedPaths(root)])]
    .filter((line) => line !== '' && !line.startsWith(scratchPrefix) && !exempt.includes(line));
}

export function unplannedPaths(task, { root, planPath, siblingWork = () => false }) {
  const entries = task.files.map((file) => file.path);
  return changedPaths(root, planPath).filter((changed) => !isCovered(entries, changed) && !coversCompanion(entries, changed) && !siblingWork(changed));
}

export function siblingWorkOf(plan, task, { root, planPath, landing }) {
  const written = landing && (task.commitBlock !== null || !task.compact);
  const added = written ? addedPathspecs(task.commitBlock ?? '') : [];
  if (added === null) return () => false;
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const entries = plan.tasks
    .filter((other) => other.number !== task.number && !landed.includes(other.number))
    .flatMap((other) => other.files.map((file) => file.path));
  const named = plan.tasks.flatMap((other) => other.files.map((file) => file.path));
  const staged = landing ? execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).split('\n') : [];
  const untracked = written ? new Set(untrackedPaths(root)) : null;
  const siblingFile = (changed) => isCovered(entries, changed) && (!written || (untracked.has(changed) && !isCovered(added, changed)));
  const planDoc = (changed) => isPlanDoc(changed) && !isCovered(named, changed) && !isCovered(added, changed);
  return (changed) => !staged.includes(changed) && (siblingFile(changed) || planDoc(changed));
}
