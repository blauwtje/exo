import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRATCH_FOLDER } from './scratch-path.mjs';

// A full check at or above this many milliseconds is too slow to run per task.
export const SLOW_GATE_MS = 60000;

const CACHE_FILE = 'check-cache.json';

const cachePath = (root) => path.join(root, SCRATCH_FOLDER, CACHE_FILE);

// The tree hash of the tracked content of the working tree, so an uncommitted edit to a tracked
// file changes it. It is built in a temporary copy of the index, which leaves the real index
// alone. Untracked files are not in it.
export function workingTreeKey(root) {
  const git = (args, env = process.env) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env }).trim();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const index = path.join(folder, 'index');
    fs.copyFileSync(path.resolve(root, git(['rev-parse', '--git-path', 'index'])), index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '-u'], env);
    return git(['write-tree'], env);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function readCache(root) {
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
    return cache !== null && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  } catch {
    return {};
  }
}

// `{ ms }` when `command` last passed on the working tree as it is now, else null.
export function cachedPass(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry.ms !== 'number') return null;
  return entry.tree === workingTreeKey(root) ? { ms: entry.ms } : null;
}

// Records that `command` passed on the working tree as it is now, in `ms` milliseconds.
export function recordPass(root, command, ms) {
  const cache = readCache(root);
  cache[command] = { tree: workingTreeKey(root), ms };
  fs.mkdirSync(path.join(root, SCRATCH_FOLDER), { recursive: true });
  fs.writeFileSync(cachePath(root), `${JSON.stringify(cache)}\n`);
}
