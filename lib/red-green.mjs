import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTreeSync } from '#process-tree';

const TEST_SEGMENT = /^(test|tests|__tests__|spec)$/;
const TEST_FILE = /(\.test\.|\.spec\.|_test\.)|^test_.*\.py$/;

export function testPaths(paths) {
  return paths.filter((p) => {
    const segments = p.split('/');
    return segments.slice(0, -1).some((s) => TEST_SEGMENT.test(s)) || TEST_FILE.test(segments.at(-1));
  });
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// The parent itself counts as inside: a top-level overlay file has the tree root as its parent.
function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function lstat(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

// Walks the segments below root, refusing symlinks and creating missing directories.
function safeParent(root, segments, create) {
  let dir = fs.realpathSync(root);
  for (const segment of segments.slice(0, -1)) {
    dir = path.join(dir, segment);
    const stat = lstat(dir);
    if (!stat) {
      if (!create) return null;
      fs.mkdirSync(dir);
    } else if (!stat.isDirectory()) throw new Error(`not a plain directory: ${segment}`);
  }
  if (!inside(fs.realpathSync(root), fs.realpathSync(dir))) throw new Error('outside the tree');
  return path.join(dir, segments.at(-1));
}

function applyOverlay(root, tree, overlay) {
  for (const p of overlay) {
    const segments = p.split('/');
    if (!p || path.isAbsolute(p) || segments.some((s) => s === '' || s === '.' || s === '..')) {
      throw new Error(`overlay path refused: ${p}`);
    }
    const from = safeParent(root, segments, false);
    const source = from && lstat(from);
    if (source && !source.isFile()) throw new Error(`overlay path is not a plain file: ${p}`);
    const to = safeParent(tree, segments, Boolean(source));
    if (!to) continue;
    const target = lstat(to);
    if (target && !target.isFile()) throw new Error(`overlay path is not a plain file: ${p}`);
    if (source) fs.copyFileSync(from, to);
    else if (target) fs.rmSync(to);
  }
}

// Same runner and shell (`bash -e -c`) as land-task's Proof run; a timeout kills the whole tree.
function run(command, cwd, timeoutMs) {
  const r = runTreeSync(command, { cwd, timeoutMs });
  if (r.timedOut) return { status: 'error', output: `${r.output}timed out after ${timeoutMs} ms` };
  if (r.error !== undefined || r.signal !== null || r.status === null) {
    return { status: 'error', output: `${r.output}${r.error?.message ?? r.signal ?? ''}` };
  }
  return { status: r.status === 0 ? 'pass' : 'fail', output: r.output };
}

function registered(root, paths) {
  const listed = git(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
  return listed.some((p) => paths.includes(p));
}

// Removes the temporary worktree; returns a note when it stays registered.
function cleanup(root, { holder, tree, treeReal }) {
  const notes = [];
  if (tree) {
    try {
      git(root, 'worktree', 'remove', '--force', tree);
    } catch (error) {
      notes.push(`worktree remove failed: ${String(error.stderr || error.message).trim()}`);
    }
  }
  if (holder) fs.rmSync(holder, { recursive: true, force: true });
  if (!tree) return '';
  try {
    git(root, 'worktree', 'prune');
    if (!registered(root, [tree, treeReal])) return '';
    notes.push(`temporary worktree still registered: ${treeReal}`);
  } catch (error) {
    notes.push(`worktree check failed: ${String(error.stderr || error.message).trim()}`);
  }
  return notes.join('\n');
}

function attempt({ root, base, command, overlay, runs, timeoutMs }, state) {
  try {
    state.sha = git(root, 'rev-parse', '--verify', `${base}^{commit}`);
    state.holder = fs.mkdtempSync(path.join(os.tmpdir(), 'red-green-'));
    const tree = path.join(state.holder, 'tree');
    state.tree = tree;
    state.treeReal = path.join(fs.realpathSync(state.holder), 'tree');
    git(root, 'worktree', 'add', '--detach', tree, state.sha);
    const modules = path.join(root, 'node_modules');
    if (lstat(modules)) fs.symlinkSync(modules, path.join(tree, 'node_modules'));
    applyOverlay(root, tree, overlay);
    let output = '';
    for (let i = 0; i < runs; i++) {
      const r = run(command, tree, timeoutMs);
      output = r.output;
      if (r.status === 'error') return { status: 'error', output };
      if (r.status === 'fail') return { status: 'red', output };
    }
    return { status: 'green', output };
  } catch (error) {
    return { status: 'error', output: String(error.stderr || error.message) };
  }
}

export function runOnBase({ root, base, command, overlay = [], runs = 1, timeoutMs }) {
  const state = { sha: '', holder: undefined, tree: undefined, treeReal: undefined };
  const result = attempt({ root, base, command, overlay, runs, timeoutMs }, state);
  const note = cleanup(root, state);
  if (note) return { status: 'error', output: `${result.output}\n${note}`, sha: state.sha };
  return { ...result, sha: state.sha };
}

export function redGreen({ root, base, command, overlay = [], repeat = 1, timeoutMs }) {
  for (let i = 0; i < repeat; i++) {
    const head = run(command, root, timeoutMs);
    if (head.status === 'error') return { outcome: 'error', lines: ['head run failed to finish', head.output] };
    if (head.status === 'fail') return { outcome: 'not-green', lines: ['the command fails on the head', head.output] };
  }
  const b = runOnBase({ root, base, command, overlay, runs: repeat, timeoutMs });
  if (b.status === 'error') return { outcome: 'error', lines: [`base run failed to finish at ${b.sha}`, b.output] };
  if (b.status === 'green') return { outcome: 'no-red', lines: [`the command also passes on ${b.sha}`] };
  return { outcome: 'proved', lines: [`the command fails on ${b.sha}`] };
}
