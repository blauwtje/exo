import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryDirectory } from '#memory-store';
import { SCRATCH_FOLDER } from './scratch-path.mjs';

// A full check at or above this many milliseconds is too slow to run per task.
export const SLOW_GATE_MS = 60000;

const CACHE_FILE = 'check-cache.json';

// One file per repository, in the common git directory every linked worktree shares.
const cachePath = (root) => path.join(memoryDirectory(root), CACHE_FILE);

// The tree hash of the working tree's tracked and untracked, non-ignored content, so an uncommitted
// edit or a new file changes it. It is built in a temporary copy of the index, which leaves the
// real index alone. The scratch folder is not in it: a recorded pass lives there.
export const workingTreeKey = (root) => treeKeys(root).tree;

// The working-tree hash and `code`, the same hash with `CHANGELOG.md` removed from that temporary
// index, so a pass holds when only the changelog differs.
function treeKeys(root) {
  const git = (args, env = process.env, input) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, input });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const index = path.join(folder, 'index');
    const real = path.resolve(root, git(['rev-parse', '--git-path', 'index']).trim());
    fs.copyFileSync(real, index);
    // Git content-checks an entry whose mtime is not older than the index file's ("racily clean").
    // The copy would get a fresh mtime and skip that check, so a same-size edit in the entry's
    // second would keep the old tree. Keep the real index's times; epoch 0 means "no time" to git.
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

// `{ ms }` when `command` last passed on the working tree as it is now, else null.
export function cachedPass(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry.ms !== 'number') return null;
  return entry.tree === workingTreeKey(root) ? { ms: entry.ms } : null;
}

// `{ ms, tree }` when `command` last passed on code equal to the working tree's, `CHANGELOG.md`
// aside; `tree` is the full tree of that pass. Entries without `code` miss.
export function codePass(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry.ms !== 'number' || typeof entry.code !== 'string') return null;
  return entry.code === treeKeys(root).code ? { ms: entry.ms, tree: entry.tree } : null;
}

// The time of `command`'s latest recorded pass on any tree, else null; cachedPass answers only
// for the current tree.
export function lastPassMs(root, command) {
  const ms = readCache(root)[command]?.ms;
  return typeof ms === 'number' ? ms : null;
}

// Records that `command` passed in `ms` milliseconds on the working tree `before`, the key taken
// before the command ran. A run that changed the tree records nothing: the pass is not for the
// tree it left.
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
