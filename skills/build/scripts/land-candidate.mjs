import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { coversCompanion, decisionsPathOf, isCovered, planTaskTrailer } from '#plan-landed';
import { SCRATCH_FOLDER } from '#scratch-path';
import { LandingError, OutsideFilesError } from './land-errors.mjs';
import { headMessage, headSha, moveHead } from './land-git.mjs';
import { gitText } from '#git';
import { candidateTrailer } from './land-commit-block.mjs';
import { nestedWorktrees } from './land-paths.mjs';
import { runLandGate } from './land-gate.mjs';
import { carryRaises } from './land-raises.mjs';

export function dropCandidate(root, { base, candidate }) {
  return moveHead(root, 'land-task: drop candidate', base, candidate) || headSha(root) === base;
}

export function clearStaleCandidate(root, planId) {
  if (!headMessage(root).split('\n').some((line) => line.startsWith(`Plan-candidate: ${planId}/`))) return;
  const candidate = headSha(root);
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' });
  if (base.status !== 0) return;
  dropCandidate(root, { base: base.stdout.trim(), candidate });
}

export function commitCandidate(block, root, task, planId, reportText = null) {
  const trailer = candidateTrailer(planId, task.number);
  const base = headSha(root);
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  carryRaises(root, reportText);
  const candidate = headSha(root);
  if (!headMessage(root).split('\n').includes(trailer)) throw new LandingError(`the Commit: block of Task ${task.number} left no commit carrying "${trailer}"`);
  if (gitText(root, ['rev-parse', `${candidate}~1`]) !== base) throw new LandingError(`the Commit: block of Task ${task.number} did not make exactly one commit on ${base.slice(0, 7)}`);
  return { base, candidate };
}

function authorEnvOf(root, candidate) {
  const [name, email, date] = gitText(root, ['log', '-1', '--format=%an%x00%ae%x00%aI', candidate]).split('\0');
  return { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date };
}

function signsCommits(root) {
  const signing = spawnSync('git', ['-C', root, 'config', '--type=bool', '--get', 'commit.gpgsign'], { encoding: 'utf8' });
  return signing.stdout.trim() === 'true';
}

export function promoteCandidate(root, task, planId, { base, candidate }) {
  const message = execFileSync('git', ['-C', root, 'log', '-1', '--format=%B', candidate], { encoding: 'utf8' })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = execFileSync('git', ['-C', root, 'commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { encoding: 'utf8', input: message, env: authorEnvOf(root, candidate) }).trim();
  if (!moveHead(root, 'land-task: promote candidate', promoted, candidate)) {
    throw new LandingError(`HEAD moved off the candidate ${candidate.slice(0, 7)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  }
}

export function gateCandidate(frame, root, gateEnv, candidate) {
  try {
    return runLandGate(frame.landGate, root, gateEnv) ?? '';
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
}

function runCommitBlock(block, root, number) {
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status === 0) return;
  const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
  throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
}

const SECURITY_BOUNDARY = /^(\.github\/|\.claude\/|hooks\/|\.env(\.|$)|.*\.(pem|key)$)/;

function outsideTaskFiles(task, { root, planPath, base }) {
  const entries = task.files.map((file) => file.path);
  const exempt = [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return gitText(root, ['diff', '--name-only', base, 'HEAD']).split('\n')
    .filter((changed) => changed !== '' && !changed.startsWith(`${SCRATCH_FOLDER}/`) && !exempt.includes(changed) && !worktrees.has(path.join(top, changed)))
    .filter((changed) => !isCovered(entries, changed) && !coversCompanion(entries, changed));
}

function quoted(paths) {
  return paths.map((file) => `\`${file}\``).join(', ');
}

function checkOutsideTaskFiles(task, options) {
  const outside = outsideTaskFiles(task, options);
  const guarded = outside.filter((changed) => SECURITY_BOUNDARY.test(changed));
  if (guarded.length > 0) throw new OutsideFilesError(`the commit of Task ${task.number} holds a security-boundary path outside Files: ${quoted(guarded)}; move it to its own task`);
  if (outside.length === 0) return;
  process.stderr.write(`Warning: the commit of Task ${task.number} holds a path outside Files: ${quoted(outside)}\n`);
}

export function committedSha(task, { root, planId, planPath, base }) {
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, task.number);
  if (!body.includes(trailer)) throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  if (gitText(root, ['rev-parse', 'HEAD~1']) !== base) throw new LandingError(`HEAD ${sha} does not sit directly on ${base.slice(0, 7)}, the commit Task ${task.number} started from`);
  checkOutsideTaskFiles(task, { root, planPath, base });
  return sha;
}
