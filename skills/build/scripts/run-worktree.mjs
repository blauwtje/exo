import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { SCRATCH_FOLDER } from '#scratch-path';

export function gitOut(root, args, { trim = true } = {}) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (answer.status !== 0) return null;
  return trim ? answer.stdout.trim() : answer.stdout.replace(/\s+$/, '');
}

export function snapshot(root) {
  return {
    head: gitOut(root, ['rev-parse', 'HEAD']),
    branch: gitOut(root, ['symbolic-ref', '-q', 'HEAD']),
    remotes: gitOut(root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes'])
  };
}

export const untrackedPaths = (root) => (gitOut(root, ['ls-files', '--others', '--exclude-standard', '-z'], { trim: false }) ?? '').split('\0').filter(Boolean);

function indexCopyEnv(root, scratch) {
  const indexFile = path.resolve(root, gitOut(root, ['rev-parse', '--git-path', 'index']) ?? '.git/index');
  const copy = path.join(scratch, 'index');
  if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, copy);
  return { ...process.env, GIT_INDEX_FILE: copy };
}

export function worktreeTree(root, skipFile) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const env = indexCopyEnv(root, scratch);
    const git = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
    if (git(['add', '-A', '--', '.']).status !== 0) return null;
    const skipped = skipFile === null ? [SCRATCH_FOLDER] : [SCRATCH_FOLDER, skipFile];
    if (git(['--literal-pathspecs', 'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...skipped]).status !== 0) return null;
    const tree = git(['write-tree']);
    return tree.status === 0 ? tree.stdout.trim() : null;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function shelveLeftover(root, patchFile, knownUntracked) {
  // why: git lists a nested repository as `dir/`, which would enter the patch as a bare commit id.
  const fresh = untrackedPaths(root).filter((file) => !knownUntracked.has(file) && !file.startsWith(`${SCRATCH_FOLDER}/`) && !file.endsWith('/'));
  const spec = ['--', '.', `:(exclude)${SCRATCH_FOLDER}`];
  const git = (args, options = {}) => spawnSync('git', ['-C', root, ...args], { maxBuffer: 1024 * 1024 * 1024, ...options });
  const failure = (step, answer) => ({ patch: null, failed: `${step} failed: ${String(answer.error?.message ?? answer.stderr ?? '').trim().split('\n')[0] || `exit ${answer.status}`}` });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-leftover-'));
  try {
    const env = indexCopyEnv(root, scratch);
    const tracked = git(['add', '-u', ...spec], { env });
    if (tracked.status !== 0) return failure('git add -u', tracked);
    const added = fresh.length === 0 ? tracked : git(['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, input: fresh.join('\0') });
    if (added.status !== 0) return failure('git add of the untracked files', added);
    const diff = git(['diff', '--cached', '--binary', 'HEAD', ...spec], { env });
    if (diff.status !== 0) return failure('git diff', diff);
    if (diff.stdout.length === 0) return { patch: null };
    try {
      fs.writeFileSync(patchFile, diff.stdout);
    } catch (error) {
      return { patch: null, failed: `writing ${path.basename(patchFile)} failed: ${error.code ?? error.message}` };
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const restored = git(['restore', '--staged', '--worktree', '--source=HEAD', ...spec]);
  if (restored.status !== 0) return { ...failure('git restore', restored), patch: patchFile };
  for (const file of fresh) fs.rmSync(path.join(root, file), { force: true });
  return { patch: patchFile };
}

const planTaskLines = (root, sha) => (gitOut(root, ['log', '-1', '--format=%B', sha]) ?? '').split('\n').filter((line) => /^Plan-task: /.test(line));

export function breachOf(root, before, { trailer = null, tail = false } = {}) {
  const after = snapshot(root);
  if (after.remotes !== before.remotes) return 'remote ref moved';
  if (after.branch !== before.branch) return 'branch moved';
  if (after.head === before.head) return null;
  if (spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', before.head, after.head]).status !== 0) return 'branch moved';
  const commits = (gitOut(root, ['rev-list', `${before.head}..${after.head}`]) ?? '').split('\n').filter(Boolean);
  if (tail) return 'extra commit';
  if (trailer === null) return commits.some((sha) => planTaskLines(root, sha).length > 0) ? 'extra commit' : null;
  if (commits.length !== 1) return 'extra commit';
  const parent = gitOut(root, ['rev-parse', `${commits[0]}^`]);
  const lines = planTaskLines(root, commits[0]);
  return parent === before.head && lines.length === 1 && lines[0] === trailer ? null : 'extra commit';
}
