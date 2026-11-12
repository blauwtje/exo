import { execFileSync } from 'node:child_process';
import { withoutRunVariables } from '#process-tree';
import { UsageError } from '#script-flags';
import { planTaskTrailer } from '#plan-landed';
import { escapeRegExp, shellQuote } from '#basics';

export { escapeRegExp };
import { LandingError } from './land-errors.mjs';

function trailersOf(planId, number, signatures) {
  return [planTaskTrailer(planId, number), ...signatures.map((signature) => `Signature: ${signature}`)].join('\n');
}

export function candidateTrailer(planId, number) {
  return `Plan-candidate: ${planId}/${number}`;
}

export function dropsOf(task) {
  return task.section.match(/^Depends on: .*?\| Drops: ([^|\n]*?) *(?:\||$)/m)?.[1] || null;
}

export function proofEnvOf(task, pendingEvidence) {
  const drops = dropsOf(task);
  const env = drops === null ? withoutRunVariables() : { ...withoutRunVariables(), EXO_DROPS: drops };
  return pendingEvidence === undefined ? env : { ...env, EXO_PENDING_EVIDENCE: pendingEvidence };
}

function addLineOf(command, paths) {
  return paths.length === 0 ? '' : `${command} ${paths.map(shellQuote).join(' ')}\n`;
}

function deriveCommit(task, number, planId, signatures, root) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${number} has no Commit: block and no Files: to derive one from`);
  }
  // why: git add refuses a path that matches neither the index nor the tree, so a path already staged as deleted stays out of it; with rename detection off, the old path of a git mv counts as a staged deletion.
  const removed = new Set(execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D'], { encoding: 'utf8' }).split('\n'));
  const paths = task.files.map((file) => file.path).filter((file) => !removed.has(file));
  const tracked = new Set(paths.length === 0 ? [] : execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...paths], { encoding: 'utf8' }).split('\0'));
  const addLine = addLineOf('git add -u --', paths.filter((file) => tracked.has(file))) + addLineOf('git add', paths.filter((file) => !tracked.has(file)));
  const drops = dropsOf(task);
  const evidence = task.evidence === null ? '' : `\nEvidence: ${task.evidence}`;
  const trailers = trailersOf(planId, number, signatures) + (drops === null ? '' : `\nDrops: ${drops}`) + evidence;
  return `${addLine}git commit -m ${shellQuote(task.title)} -m ${shellQuote(trailers)}`;
}


export function commitBlockOf(plan, number, planId, signatures = [], root = '.') {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock !== null) {
    if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
      throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
    }
    return task.commitBlock.replace(`"Plan-task: ${number}"`, shellQuote(trailersOf(planId, number, signatures)));
  }
  if (task.compact) return deriveCommit(task, number, planId, signatures, root);
  throw new LandingError(`Task ${number} has no Commit: block`);
}
