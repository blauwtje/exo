import { gitText } from '#git';
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

export function commitBlockOf({ task, planId, root, unlistedLine = '' }) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${task.number} has no Files: to commit`);
  }
  const removed = new Set(gitText(root, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D'], { trim: false }).split('\n'));
  const paths = task.files.map((file) => file.path).filter((file) => !removed.has(file));
  const tracked = new Set(paths.length === 0 ? [] : gitText(root, ['ls-files', '-z', '--', ...paths], { trim: false }).split('\0'));
  const addLine = addLineOf('git add -u --', paths.filter((file) => tracked.has(file))) + addLineOf('git add --', paths.filter((file) => !tracked.has(file)));
  return `${addLine}git commit -m ${shellQuote(task.title)}${unlistedLine === '' ? '' : ` -m ${shellQuote(unlistedLine.trim())}`} -m ${shellQuote(planTaskTrailer(planId, task.number))}`;
}
