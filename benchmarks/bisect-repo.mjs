import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { environmentMs } from '#script-flags';
import { linkedWorktrees } from './value.mjs';

const REPRO_TIMEOUT_MS = environmentMs('EXO_BISECT_REPRO_MS', 60000);
const BUILD_TIMEOUT_MS = environmentMs('EXO_BISECT_BUILD_MS', 120000);

export function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function buildCase(spec, destination) {
  execFileSync(process.execPath, [path.join(spec.directory, 'build.mjs'), destination], { stdio: ['ignore', 'pipe', 'pipe'], timeout: BUILD_TIMEOUT_MS });
  return destination;
}

export function reproPasses(directory, repro) {
  const run = spawnSync('sh', ['-c', repro], { cwd: directory, stdio: 'ignore', timeout: REPRO_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return run.status === 0;
}

export function reproHolds(directory, spec) {
  const runs = spec.kind === 'flaky' ? spec.flakyRuns : 1;
  return Array.from({ length: runs }).every(() => reproPasses(directory, spec.repro));
}

function addWorktree(repo, directory, revision) {
  const run = spawnSync('git', ['-C', repo, 'worktree', 'add', '--detach', '--quiet', directory, revision], { stdio: 'ignore' });
  return run.status === 0;
}

export function holdsAt(repo, revision, spec) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-tree-'));
  const directory = path.join(parent, 'tree');
  try {
    return addWorktree(repo, directory, revision) && reproHolds(directory, spec);
  } finally {
    spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', directory], { stdio: 'ignore' });
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function localBranches(repo) {
  return git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean);
}

export function startCommit(repo) {
  return git(repo, ['rev-parse', 'HEAD']).trim();
}

function descendsFrom(directory, revision, start) {
  return spawnSync('git', ['-C', directory, 'merge-base', '--is-ancestor', start, revision], { stdio: 'ignore' }).status === 0;
}

function holdsFrom(directory, spec, start) {
  return descendsFrom(directory, 'HEAD', start) && reproHolds(directory, spec);
}

export function reproGreen(repo, spec, start) {
  if (holdsFrom(repo, spec, start)) return true;
  if (linkedWorktrees(repo).some((directory) => fs.existsSync(directory) && holdsFrom(directory, spec, start))) return true;
  return localBranches(repo).filter((branch) => descendsFrom(repo, branch, start)).some((branch) => holdsAt(repo, branch, spec));
}

export function commitsWithSubject(repo, subject) {
  return git(repo, ['log', '--format=%H%x09%s', 'HEAD']).split('\n').filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([, text]) => text === subject)
    .map(([sha]) => sha);
}

export function culpritSha(repo, subject) {
  const matches = commitsWithSubject(repo, subject);
  if (matches.length !== 1) throw new Error(`culprit subject ${JSON.stringify(subject)} names ${matches.length} commits, not one`);
  return matches[0];
}

export function commitCount(repo) {
  return Number(git(repo, ['rev-list', '--count', 'HEAD']).trim());
}
