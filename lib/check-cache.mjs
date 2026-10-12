import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryDirectory } from '#memory-store';
import { SCRATCH_FOLDER } from './scratch-path.mjs';

export const SLOW_GATE_MS = 60000;

const CACHE_FILE = 'check-cache.json';

const cachePath = (root) => path.join(memoryDirectory(root), CACHE_FILE);

export const workingTreeKey = (root) => treeKeys(root).tree;

function treeKeys(root) {
  const git = (args, env = process.env, input) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, input });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const index = path.join(folder, 'index');
    const real = path.resolve(root, git(['rev-parse', '--git-path', 'index']).trim());
    fs.copyFileSync(real, index);
    const { atime, mtime } = fs.statSync(real);
    fs.utimesSync(index, atime, mtime);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '-u'], env);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
      .filter((file) => file !== '' && file !== SCRATCH_FOLDER && !file.startsWith(`${SCRATCH_FOLDER}/`));
    if (untracked.length > 0) git(['add', '--pathspec-from-file=-', '--pathspec-file-nul'], { ...env, GIT_LITERAL_PATHSPECS: '1' }, untracked.join('\0'));
    const tree = git(['write-tree'], env).trim();
    git(['rm', '--cached', '-q', '--ignore-unmatch', '--', 'CHANGELOG.md'], env);
    return { tree, code: git(['write-tree'], env).trim() };
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

export function cachedPass(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry.ms !== 'number') return null;
  return entry.tree === workingTreeKey(root) ? { ms: entry.ms } : null;
}

export function codePass(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry.ms !== 'number' || typeof entry.code !== 'string') return null;
  return entry.code === treeKeys(root).code ? { ms: entry.ms, tree: entry.tree } : null;
}

export function lastPassMs(root, command) {
  const ms = readCache(root)[command]?.ms;
  return typeof ms === 'number' ? ms : null;
}

export function recordPass(root, command, ms, before = workingTreeKey(root)) {
  const cache = readCache(root);
  const now = treeKeys(root);
  if (now.tree !== before) return;
  cache[command] = { tree: before, code: now.code, ms };
  const file = cachePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(cache)}\n`);
  fs.renameSync(temp, file);
}
