import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { frameOf, parsePlan } from '#plan-tasks';
import { attributionProblem, subjectProblem } from '#commit-text';
import { LandingError } from './land-errors.mjs';
import { locked } from './land-git.mjs';
import { refuseMismatchedToplevel } from './land-pin.mjs';
import { changedPaths } from './land-paths.mjs';
import { runLint } from './land-code-rules.mjs';

export function refuseBadCommitText(subject, rest = '') {
  const problem = subjectProblem(subject) ?? attributionProblem(`${subject}\n${rest}`);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

export function fixLand({ root, subject, body = null, plan = null, pin = null }) {
  if (pin !== null) throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; --fix is refused`);
  refuseMismatchedToplevel(root);
  refuseBadCommitText(subject, body ?? '');
  return locked(root, () => fixLandLocked({ root, subject, body, plan }));
}

function fixLandLocked({ root, subject, body, plan }) {
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit');
  }
  if (plan !== null) runLint(frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).lint, changedPaths(root), root);
  execFileSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
  const messages = body === null ? ['-m', subject] : ['-m', subject, '-m', body];
  execFileSync('git', ['-C', root, 'commit', ...messages], { encoding: 'utf8' });
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return `Committed: ${sha}\n`;
}
