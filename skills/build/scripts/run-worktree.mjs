import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { git, gitLine } from '#git';
import { CHILD_OUTPUT_LIMIT } from '#process-tree';
import { SCRATCH_FOLDER } from '#scratch-path';

export const GIT_LIMIT = { maxBuffer: CHILD_OUTPUT_LIMIT };

export function snapshot(root) {
  return {
    head: gitLine(root, ['rev-parse', 'HEAD'], GIT_LIMIT),
    branch: gitLine(root, ['symbolic-ref', '-q', 'HEAD'], GIT_LIMIT),
    remotes: refTips(root, 'refs/remotes'),
    heads: refTips(root, 'refs/heads')
  };
}

function refTips(root, prefix) {
  const listing = gitLine(root, ['for-each-ref', '--format=%(refname) %(objectname)', prefix], GIT_LIMIT);
  if (listing === null) return null;
  const tips = {};
  for (const line of listing.split('\n').filter(Boolean)) {
    const space = line.lastIndexOf(' ');
    tips[line.slice(0, space)] = line.slice(space + 1);
  }
  return tips;
}

export const untrackedPaths = (root) => (gitLine(root, ['ls-files', '--others', '--exclude-standard', '-z'], { ...GIT_LIMIT, trim: false }) ?? '').split('\0').filter(Boolean);

function indexCopyEnv(root, scratch) {
  const indexFile = path.resolve(root, gitLine(root, ['rev-parse', '--git-path', 'index'], GIT_LIMIT) ?? '.git/index');
  const copy = path.join(scratch, 'index');
  if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, copy);
  return { ...process.env, GIT_INDEX_FILE: copy };
}

export function worktreeTree(root, skipFile) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const env = indexCopyEnv(root, scratch);
    const run = (args) => git(root, args, { env, ...GIT_LIMIT });
    if (run(['add', '-A', '--', '.']).status !== 0) return null;
    const skipped = skipFile === null ? [SCRATCH_FOLDER] : [SCRATCH_FOLDER, skipFile];
    if (run(['--literal-pathspecs', 'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...skipped]).status !== 0) return null;
    const tree = run(['write-tree']);
    return tree.status === 0 ? tree.stdout.trim() : null;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function patchWriteFailure(patchFile, content) {
  try {
    fs.writeFileSync(patchFile, content);
    return null;
  } catch (error) {
    if (typeof error.code !== 'string') throw error;
    return `writing ${path.basename(patchFile)} failed: ${error.code}`;
  }
}

export function shelveLeftover(root, patchFile, knownUntracked) {
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
    const writeFailure = patchWriteFailure(patchFile, diff.stdout);
    if (writeFailure !== null) return { patch: null, failed: writeFailure };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const restored = git(['restore', '--staged', '--worktree', '--source=HEAD', ...spec]);
  if (restored.status !== 0) return { ...failure('git restore', restored), patch: patchFile };
  for (const file of fresh) fs.rmSync(path.join(root, file), { force: true });
  return { patch: patchFile };
}

const planTaskLines = (root, sha) => (gitLine(root, ['log', '-1', '--format=%B', sha], GIT_LIMIT) ?? '').split('\n').filter((line) => /^Plan-task: /.test(line));

function ownBranchMoved(root, before, after) {
  const names = gitLine(root, ['remote'], GIT_LIMIT);
  if (names === null) return JSON.stringify(after.remotes) !== JSON.stringify(before.remotes);
  const branch = before.branch.replace(/^refs\/heads\//, '');
  return names.split('\n').filter(Boolean).some((name) => before.remotes[`refs/remotes/${name}/${branch}`] !== after.remotes[`refs/remotes/${name}/${branch}`]);
}

function remoteBreach(root, before, after) {
  if (before.remotes === null || after.remotes === null || before.head === null || after.head === null) return JSON.stringify(after.remotes) !== JSON.stringify(before.remotes);
  if (before.branch !== null && ownBranchMoved(root, before, after)) return true;
  const changed = Object.keys(after.remotes).filter((ref) => before.remotes[ref] !== after.remotes[ref]);
  if (changed.length === 0) return false;
  if (before.heads === null) return true;
  const others = Object.entries(before.heads).filter(([ref]) => ref !== before.branch).map(([, sha]) => sha);
  for (const ref of changed) {
    const old = before.remotes[ref];
    const stops = old === undefined ? Object.values(before.remotes) : [old];
    const bases = spawnSync('git', ['-C', root, 'merge-base', '--all', after.head, after.remotes[ref]], { encoding: 'utf8' });
    if (bases.status === 1 && bases.stdout.trim() === '') continue;
    if (bases.status !== 0) return true;
    const tips = bases.stdout.split('\n').filter(Boolean);
    const exclusions = [...stops, ...others].map((sha) => `^${sha}`);
    const owned = gitLine(root, ['rev-list', '--max-count=1', ...tips, ...exclusions], GIT_LIMIT);
    if (owned === null || owned !== '') return true;
  }
  return false;
}

export function breachOf(root, before, { trailer = null, tail = false }) {
  const after = snapshot(root);
  if (remoteBreach(root, before, after)) return 'remote ref moved';
  if (after.branch !== before.branch) return 'branch moved';
  if (after.head === before.head) return null;
  if (spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', before.head, after.head]).status !== 0) return 'branch moved';
  const commits = (gitLine(root, ['rev-list', `${before.head}..${after.head}`], GIT_LIMIT) ?? '').split('\n').filter(Boolean);
  if (tail) return 'extra commit';
  if (trailer === null) return commits.some((sha) => planTaskLines(root, sha).length > 0) ? 'extra commit' : null;
  if (commits.length !== 1) return 'extra commit';
  const parent = gitLine(root, ['rev-parse', `${commits[0]}^`], GIT_LIMIT);
  const lines = planTaskLines(root, commits[0]);
  return parent === before.head && lines.length === 1 && lines[0] === trailer ? null : 'extra commit';
}
