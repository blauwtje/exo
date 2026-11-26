import fs from 'node:fs';
import path from 'node:path';
import { repoState } from '#repo-state';
import { planTaskTrailer } from '#plan-landed';
import { isListedIn } from '#plan-tasks';
import { shellQuote } from '#basics';
import { LandingError } from './land-errors.mjs';

export function candidatePrefix(planId) {
  return `Plan-candidate: ${planId}/`;
}

export function candidateTrailer(planId, number) {
  return `${candidatePrefix(planId)}${number}`;
}

function addLineOf(command, paths) {
  return paths.length === 0 ? '' : `${command} ${paths.map(shellQuote).join(' ')}\n`;
}

function filesOf(task, state) {
  const files = task.files.map(({ path: file }) => file);
  const removed = state.stagedDeletions();
  const tracked = state.trackedPaths(files);
  const ignored = state.ignoredPaths(files);
  const untracked = state.untrackedPaths();
  const present = [];
  const missing = [];
  for (const file of files) {
    if (file.endsWith('/') ? [...removed].some((gone) => gone.startsWith(file)) : removed.has(file)) continue;
    const exists = fs.existsSync(path.join(state.root, file));
    const listed = tracked.some((entry) => isListedIn(file, entry)) || untracked.some((entry) => isListedIn(file, entry));
    if (!exists && !listed) missing.push(file);
    else if (exists && !listed && ignored.has(file)) {
      throw new LandingError(`Task ${task.number}: Files path ${file} is ignored by git; remove it from Files: or from .gitignore`);
    } else present.push(file);
  }
  return { present, missing, tracked: new Set(tracked) };
}

export function missingFilesLine(task, state) {
  const { missing } = filesOf(task, state);
  return missing.length === 0 ? '' : `Files not found: ${missing.join(', ')}\n`;
}

export function commitBlockOf({ task, planId, root, unlistedLine = '', state = repoState(root) }) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${task.number} has no Files: to commit`);
  }
  const { present: paths, tracked } = filesOf(task, state);
  const addLine = addLineOf('git add -u --', paths.filter((file) => tracked.has(file))) + addLineOf('git add --', paths.filter((file) => !tracked.has(file)));
  return `${addLine}git commit -m ${shellQuote(task.title)}${unlistedLine === '' ? '' : ` -m ${shellQuote(unlistedLine.trim())}`} -m ${shellQuote(planTaskTrailer(planId, task.number))}`;
}
