import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
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

function run(command, cwd, timeoutMs) {
  const r = spawnSync(command, { shell: true, cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error || r.signal || r.status === null) return { status: 'error', output: `${output}${r.error?.message ?? r.signal ?? ''}` };
  return { status: r.status === 0 ? 'pass' : 'fail', output };
}

export function runOnBase({ root, base, command, overlay = [], runs = 1, timeoutMs }) {
  let holder;
  let tree;
  let sha = '';
  try {
    sha = git(root, 'rev-parse', '--verify', `${base}^{commit}`);
    holder = fs.mkdtempSync(path.join(os.tmpdir(), 'red-green-'));
    tree = path.join(holder, 'tree');
    git(root, 'worktree', 'add', '--detach', tree, sha);
    const modules = path.join(root, 'node_modules');
    if (lstat(modules)) fs.symlinkSync(modules, path.join(tree, 'node_modules'));
    applyOverlay(root, tree, overlay);
    let output = '';
    for (let i = 0; i < runs; i++) {
      const r = run(command, tree, timeoutMs);
      output = r.output;
      if (r.status === 'error') return { status: 'error', output, sha };
      if (r.status === 'fail') return { status: 'red', output, sha };
    }
    return { status: 'green', output, sha };
  } catch (error) {
    return { status: 'error', output: String(error.stderr || error.message), sha };
  } finally {
    if (tree) {
      try {
        git(root, 'worktree', 'remove', '--force', tree);
      } catch {}
      try {
        git(root, 'worktree', 'prune');
      } catch {}
    }
    if (holder) fs.rmSync(holder, { recursive: true, force: true });
  }
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
