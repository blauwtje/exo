import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { decisionsPathOf, planTaskTrailer } from '#plan-landed';
import { SCRATCH_FOLDER } from '#scratch-path';
import { LandingError } from './land-errors.mjs';
import { headMessage, headSha, moveHead } from './land-git.mjs';
import { gitText, shortSha } from '#git';
import { createWorktree, worktreePath } from '#checkout';
import { candidateTrailer } from './land-commit-block.mjs';
import { isProtectedPath, nestedWorktrees } from './land-paths.mjs';
import { runLandGate } from './land-gate.mjs';
import { discard, runSetup, slotEnvOf } from './open-slots.mjs';

const RAISE_PREFIX = /^Budget-raise:[ \t]/;

function raiseLinesOf(reportText) {
  if (reportText === null) return [];
  return [...new Set(reportText.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter((line) => RAISE_PREFIX.test(line)))];
}

function carryRaises(root, reportText) {
  const message = headMessage(root);
  const present = new Set(message.split('\n'));
  const missing = raiseLinesOf(reportText).filter((line) => !present.has(line));
  if (missing.length === 0) return;
  const amended = spawnSync('git', ['-C', root, 'commit', '--amend', '-q', '--no-verify', '-F', '-'], { encoding: 'utf8', input: `${message.trimEnd()}\n${missing.join('\n')}\n` });
  if (amended.status !== 0) throw new LandingError(`carrying the Budget-raise lines onto the task commit failed:\n${amended.stderr}`);
}

export function dropCandidate(root, { base, candidate }) {
  return moveHead(root, 'land-task: drop candidate', { target: base, expected: candidate }) || headSha(root) === base;
}

export function clearStaleCandidate(root, planId) {
  if (!headMessage(root).split('\n').some((line) => line.startsWith(`Plan-candidate: ${planId}/`))) return;
  const candidate = headSha(root);
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' });
  if (base.status !== 0) return;
  dropCandidate(root, { base: base.stdout.trim(), candidate });
}

export function commitCandidate({ block, root, task, planId, reportText = null }) {
  const trailer = candidateTrailer(planId, task.number);
  const base = headSha(root);
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  carryRaises(root, reportText);
  const candidate = headSha(root);
  if (!headMessage(root).split('\n').includes(trailer)) throw new LandingError(`the Commit: block of Task ${task.number} left no commit carrying "${trailer}"`);
  if (gitText(root, ['rev-parse', `${candidate}~1`]) !== base) throw new LandingError(`the Commit: block of Task ${task.number} did not make exactly one commit on ${shortSha(base)}`);
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

export function promoteCandidate({ root, task, planId, candidate: { base, candidate } }) {
  const message = execFileSync('git', ['-C', root, 'log', '-1', '--format=%B', candidate], { encoding: 'utf8' })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = execFileSync('git', ['-C', root, 'commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { encoding: 'utf8', input: message, env: authorEnvOf(root, candidate) }).trim();
  if (!moveHead(root, 'land-task: promote candidate', { target: promoted, expected: candidate })) {
    throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  }
}

function slotDiffersFromCandidate(root) {
  const status = gitText(root, ['status', '--porcelain', '--untracked-files=all'], { trim: false });
  return status.split('\n').some((line) => line !== '' && !line.slice(3).startsWith(`${SCRATCH_FOLDER}/`));
}

function gateOnDetachedCandidate({ frame, root, gateEnv, candidate }) {
  const where = worktreePath(`gate-${candidate.candidate.slice(0, 12)}`, root);
  const made = createWorktree(root, where, ['--detach', where, candidate.candidate]);
  if (!made.ok) throw new LandingError(made.failure);
  try {
    const failed = runSetup(where, frame.worktreeSetup, slotEnvOf(root));
    if (failed !== null) throw new LandingError(failed.reason);
    return runLandGate(frame.landGate, where, gateEnv) ?? '';
  } finally {
    discard(root, [where]);
  }
}

export function gateCandidate({ frame, root, gateEnv, candidate }) {
  try {
    if (slotDiffersFromCandidate(root)) return gateOnDetachedCandidate({ frame, root, gateEnv, candidate });
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

export function stageOutside(root, paths) {
  if (paths.length > 0) execFileSync('git', ['-C', root, 'update-index', '--add', '--remove', '--', ...paths]);
}

function committedProtectedPaths({ root, planPath, base }) {
  const exempt = [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return gitText(root, ['diff', '--name-only', base, 'HEAD']).split('\n')
    .filter((changed) => changed !== '' && !changed.startsWith(`${SCRATCH_FOLDER}/`) && !exempt.includes(changed) && !worktrees.has(path.join(top, changed)))
    .filter(isProtectedPath);
}

function warnProtectedPaths(task, options) {
  const protectedPaths = committedProtectedPaths(options);
  if (protectedPaths.length === 0) return;
  process.stderr.write(`[WARN] Task ${task.number} committed a security-boundary path: ${protectedPaths.map((file) => `\`${file}\``).join(', ')}\n`);
}

export function committedSha(task, { root, planId, planPath, base }) {
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, task.number);
  if (!body.includes(trailer)) throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  if (gitText(root, ['rev-parse', 'HEAD~1']) !== base) throw new LandingError(`HEAD ${sha} does not sit directly on ${shortSha(base)}, the commit Task ${task.number} started from`);
  warnProtectedPaths(task, { root, planPath, base });
  return sha;
}
