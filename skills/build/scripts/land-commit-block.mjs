import fs from 'node:fs';
import path from 'node:path';
import { git, gitText } from '#git';
import { planTaskTrailer } from '#plan-landed';
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

function filesOf(task, root) {
  const removed = new Set(gitText(root, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D'], { trim: false }).split('\n'));
  const present = [];
  const missing = [];
  for (const { path: file } of task.files) {
    if (removed.has(file)) continue;
    const exists = fs.existsSync(path.join(root, file));
    const listed = git(root, ['ls-files', '--', file]).stdout.trim() !== '';
    if (!exists && !listed) missing.push(file);
    else if (exists && !listed && git(root, ['check-ignore', '-q', '--', file]).status === 0) {
      throw new LandingError(`Task ${task.number}: Files path ${file} is ignored by git; remove it from Files: or from .gitignore`);
    } else present.push(file);
  }
  return { present, missing };
}

export function missingFilesLine(task, root) {
  const { missing } = filesOf(task, root);
  return missing.length === 0 ? '' : `Files not found: ${missing.join(', ')}\n`;
}

export function commitBlockOf({ task, planId, root, unlistedLine = '' }) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${task.number} has no Files: to commit`);
  }
  const { present: paths } = filesOf(task, root);
  const tracked = new Set(paths.length === 0 ? [] : gitText(root, ['ls-files', '-z', '--', ...paths], { trim: false }).split('\0'));
  const addLine = addLineOf('git add -u --', paths.filter((file) => tracked.has(file))) + addLineOf('git add --', paths.filter((file) => !tracked.has(file)));
  return `${addLine}git commit -m ${shellQuote(task.title)}${unlistedLine === '' ? '' : ` -m ${shellQuote(unlistedLine.trim())}`} -m ${shellQuote(planTaskTrailer(planId, task.number))}`;
}
