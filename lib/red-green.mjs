import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cachedPass, recordPass, successCriterionPasses, workingTreeKey } from '#check-cache';
import { runTreeSync, withoutRunVariables } from '#process-tree';
import { SCRATCH_FOLDER } from './scratch-path.mjs';

const TEST_SEGMENT = /^(test|tests|__tests__)$/;
const TEST_FILE = /[._](test|spec)\.|^test_/;

export function isTestPath(filePath) {
  const segments = filePath.split('/');
  return segments.slice(0, -1).some((s) => TEST_SEGMENT.test(s)) || TEST_FILE.test(segments.at(-1));
}

export function testPaths(paths) {
  return paths.filter(isTestPath);
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

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

function applyOverlayFromRef({ root, ref, tree }, overlay) {
  for (const p of overlay) {
    const segments = p.split('/');
    if (!p || path.isAbsolute(p) || segments.some((s) => s === '' || s === '.' || s === '..')) {
      throw new Error(`overlay path refused: ${p}`);
    }
    const entry = git(root, 'ls-tree', ref, '--', p);
    const mode = entry.split(/\s/)[0];
    if (entry && mode !== '100644' && mode !== '100755') throw new Error(`overlay path is not a plain file: ${p}`);
    const to = safeParent(tree, segments, Boolean(entry));
    if (!to) continue;
    const target = lstat(to);
    if (target && !target.isFile()) throw new Error(`overlay path is not a plain file: ${p}`);
    if (entry) fs.writeFileSync(to, execFileSync('git', ['-C', root, 'show', `${ref}:${p}`], { stdio: ['ignore', 'pipe', 'pipe'] }));
    else if (target) fs.rmSync(to);
  }
}

function run(command, cwd, timeoutMs) {
  const r = runTreeSync(command, { cwd, timeoutMs, env: withoutRunVariables() });
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

function attempt({ root, source, sourceRef, base, command, overlay, runs, timeoutMs }, state) {
  try {
    state.sha = git(root, 'rev-parse', '--verify', `${base}^{commit}`);
    state.holder = fs.mkdtempSync(path.join(os.tmpdir(), 'red-green-'));
    const tree = path.join(state.holder, 'tree');
    state.tree = tree;
    state.treeReal = path.join(fs.realpathSync(state.holder), 'tree');
    git(root, 'worktree', 'add', '--detach', tree, state.sha);
    const modules = path.join(root, 'node_modules');
    if (lstat(modules)) fs.symlinkSync(modules, path.join(tree, 'node_modules'));
    if (sourceRef) applyOverlayFromRef({ root, ref: sourceRef, tree }, overlay);
    else applyOverlay(source, tree, overlay);
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

export function runInWorktree({ root, source = root, sourceRef, base, command, overlay = [], runs = 1, timeoutMs }) {
  const state = { sha: '', holder: undefined, tree: undefined, treeReal: undefined };
  const result = attempt({ root, source, sourceRef, base, command, overlay, runs, timeoutMs }, state);
  const note = cleanup(root, state);
  if (note) return { status: 'error', output: `${result.output}\n${note}`, sha: state.sha };
  return { ...result, sha: state.sha };
}

export function runOnBase({ root, base, command, overlay = [], runs = 1, timeoutMs }) {
  return runInWorktree({ root, source: root, base, command, overlay, runs, timeoutMs });
}

function resolveBase(root, base) {
  try {
    return git(root, 'rev-parse', '--verify', `${base}^{commit}`);
  } catch {
    return null;
  }
}

export function redGreen({ root, base, command, overlay = [], repeat = 1, timeoutMs }) {
  const sha = resolveBase(root, base);
  const provedKey = `red-green:${sha}:${command}`;
  if (sha !== null && cachedPass(root, provedKey) !== null) return { outcome: 'proved', lines: ['proved on this same tree'] };
  const before = workingTreeKey(root);
  let clean = true;
  let headMs = 0;
  for (let i = 0; i < repeat; i++) {
    const started = Date.now();
    const head = runInWorktree({ root, base: 'HEAD', command, runs: 1, timeoutMs });
    headMs = Date.now() - started;
    if (head.status === 'error') return { outcome: 'error', lines: ['head run failed to finish', head.output] };
    if (head.status === 'red') return { outcome: 'not-green', lines: ['the command fails on the head', head.output] };
    clean = clean && successCriterionPasses({ ok: true, output: head.output });
  }
  // why: the scratch folder and the plan decisions file move after a pass and are not part of the cache key.
  const committed = git(root, 'status', '--porcelain', '-z').split('\0').every((entry) => {
    const file = entry.slice(3);
    return entry === '' || file === `${SCRATCH_FOLDER}/` || file.startsWith(`${SCRATCH_FOLDER}/`) || /(^|\/)[^/]+-decisions\.md$/.test(file);
  });
  if (clean && committed) recordPass(root, command, headMs, before);
  const b = runInWorktree({ root, sourceRef: 'HEAD', base, command, overlay, runs: repeat, timeoutMs });
  if (b.status === 'error') return { outcome: 'error', lines: [`base run failed to finish at ${b.sha}`, b.output] };
  if (b.status === 'green') return { outcome: 'no-red', lines: [`the command also passes on ${b.sha}`] };
  if (committed) recordPass(root, provedKey, headMs, before);
  return { outcome: 'proved', lines: [`the command fails on ${b.sha}`] };
}
