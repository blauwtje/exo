import { spawnSync } from 'node:child_process';
import { git, shortSha, gitText } from '#git';
import { planTaskTrailer } from '#plan-landed';
import { LandingError } from './land-errors.mjs';
import { moveHead } from './land-git.mjs';
import { candidatePrefix, candidateTrailer } from './land-commit-block.mjs';

export function dropCandidate(state, { base, candidate }) {
  const moved = moveHead(state.root, 'land-task: drop candidate', { target: base, expected: candidate });
  state.invalidate();
  return moved || state.head().sha === base;
}

export function clearStaleCandidate(state, planId) {
  const head = state.head();
  if (!head.message.split('\n').some((line) => line.startsWith(candidatePrefix(planId)))) return;
  const base = git(state.root, ['rev-parse', 'HEAD~1']);
  if (base.status !== 0) return;
  dropCandidate(state, { base: base.stdout.trim(), candidate: head.sha });
}

export function commitCandidate({ block, state, task, planId }) {
  const { root } = state;
  const trailer = candidateTrailer(planId, task.number);
  const base = state.head().sha;
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  state.invalidate();
  const { sha: candidate, message } = state.head();
  if (!message.split('\n').includes(trailer)) throw new LandingError(`the commit of Task ${task.number} left no commit carrying "${trailer}"`);
  if (gitText(root, ['rev-parse', `${candidate}~1`]) !== base) throw new LandingError(`the commit of Task ${task.number} did not make exactly one commit on ${shortSha(base)}`);
  return { base, candidate };
}

function authorEnvOf(root, candidate) {
  const [name, email, date] = gitText(root, ['log', '-1', '--format=%an%x00%ae%x00%aI', candidate]).split('\0');
  return { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date };
}

function signsCommits(root) {
  const signing = git(root, ['config', '--type=bool', '--get', 'commit.gpgsign']);
  return signing.stdout.trim() === 'true';
}

export function promoteCandidate({ state, task, planId, candidate: { base, candidate } }) {
  const { root } = state;
  const message = gitText(root, ['log', '-1', '--format=%B', candidate], { trim: false })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = gitText(root, ['commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { input: message, stdio: 'pipe', env: authorEnvOf(root, candidate) });
  const moved = moveHead(root, 'land-task: promote candidate', { target: promoted, expected: candidate });
  state.invalidate();
  if (!moved) throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
}

function runCommitBlock(block, root, number) {
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status === 0) return;
  const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
  throw new LandingError(`the commit of Task ${number} failed:\n${output}`);
}
