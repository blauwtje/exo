import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addWorktree } from '#checkout';
import { runTreeSync, withoutRunVariables } from '#process-tree';
import { environmentMs } from '#script-flags';
import { gitText } from './git.mjs';

const TEST_FOLDER = /^(tests?|__tests?__)$|[._-](tests?|specs?)$/i;
const SPEC_ROOT = /^specs?$/i;
const TEST_FOLDER_CAMEL = /[a-z0-9](Tests?|Specs?)$/;
const TEST_FILE = /[._-](tests?|specs?)\.|^test[_-]/i;
const TEST_FILE_CAMEL = /[a-z0-9](Tests?|Specs?)\./;

export function isTestPath(filePath) {
  const segments = filePath.split('/');
  const name = segments.at(-1);
  const inTestFolder = segments.slice(0, -1).some((s, i) => TEST_FOLDER.test(s) || TEST_FOLDER_CAMEL.test(s) || (i === 0 && SPEC_ROOT.test(s)));
  return inTestFolder || TEST_FILE.test(name) || TEST_FILE_CAMEL.test(name);
}

function namedByProof(filePath, proofCommands) {
  const tokens = proofCommands.flatMap((command) => command.split(/\s+/))
    .map((token) => token.replace(/^["']+|["']+$/g, '').replace(/^(\.\/)+/, '').replace(/\/+$/, ''))
    .filter((token) => token !== '' && token !== '.');
  return tokens.some((token) => filePath === token || filePath.startsWith(token + '/'));
}

export function testPaths(paths, proofCommands = []) {
  const byConvention = paths.filter(isTestPath);
  return byConvention.length > 0 ? byConvention : paths.filter((p) => namedByProof(p, proofCommands));
}

const PROSE_PROOF = /`/;

function runnableProof(proof) {
  if (proof === null || PROSE_PROOF.test(proof)) return null;
  return proof;
}

export function isTestFirst(task) {
  if (runnableProof(task.proof) === null || task.red !== null) return false;
  return task.risk !== null || (/^fix\b/.test(task.title) && task.files.some((file) => isTestPath(file.path)));
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

function enterDir(dir, segment, create) {
  const stat = lstat(dir);
  if (stat?.isDirectory()) return true;
  if (stat) throw new Error(`not a plain directory: ${segment}`);
  if (!create) return false;
  fs.mkdirSync(dir);
  return true;
}

function safeParent(root, segments, create) {
  let dir = fs.realpathSync(root);
  for (const segment of segments.slice(0, -1)) {
    dir = path.join(dir, segment);
    if (!enterDir(dir, segment, create)) return null;
  }
  if (!inside(fs.realpathSync(root), fs.realpathSync(dir))) throw new Error('outside the tree');
  return path.join(dir, segments.at(-1));
}

function overlaySegments(p) {
  const segments = p.split('/');
  if (!p || path.isAbsolute(p) || segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`overlay path refused: ${p}`);
  }
  return segments;
}

function applyOverlay(root, tree, overlay) {
  for (const p of overlay) {
    const segments = overlaySegments(p);
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

const BASE_RUN_ALLOWANCE_OVER_HEAD_MS = 60_000;

const seconds = (ms) => `${Number((ms / 1000).toFixed(1))} s`;

function run(command, cwd, { timeoutMs, headMs }) {
  const boundMs = typeof headMs === 'number' ? Math.min(timeoutMs, headMs + environmentMs('EXO_RED_BASE_MARGIN_MS', BASE_RUN_ALLOWANCE_OVER_HEAD_MS)) : timeoutMs;
  const r = runTreeSync(command, { cwd, timeoutMs: boundMs, env: withoutRunVariables() });
  if (r.timedOut && boundMs < timeoutMs) {
    return { status: 'fail', output: `${r.output}base run did not finish within ${seconds(boundMs)}; head run took ${seconds(headMs)}` };
  }
  if (r.timedOut) return { status: 'error', output: `${r.output}timed out after ${timeoutMs} ms` };
  if (r.error !== undefined || r.signal !== null || r.status === null) {
    return { status: 'error', output: `${r.output}${r.error?.message ?? r.signal ?? ''}` };
  }
  return { status: r.status === 0 ? 'pass' : 'fail', output: r.output };
}

function registered(root, paths) {
  const listed = gitText(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
  return listed.some((p) => paths.includes(p));
}

function cleanup(root, { holder, tree, treeReal }) {
  const notes = [];
  if (tree) {
    try {
      gitText(root, ['worktree', 'remove', '--force', tree]);
    } catch (error) {
      notes.push(`worktree remove failed: ${String(error.stderr || error.message).trim()}`);
    }
  }
  if (holder) fs.rmSync(holder, { recursive: true, force: true });
  if (!tree) return '';
  try {
    gitText(root, ['worktree', 'prune']);
    if (!registered(root, [tree, treeReal])) return '';
    notes.push(`temporary worktree still registered: ${treeReal}`);
  } catch (error) {
    notes.push(`worktree check failed: ${String(error.stderr || error.message).trim()}`);
  }
  return notes.join('\n');
}

function runRepeated(command, tree, { runs, ...limits }) {
  let output = '';
  for (let i = 0; i < runs; i++) {
    const r = run(command, tree, limits);
    output = r.output;
    if (r.status === 'error') return { status: 'error', output };
    if (r.status === 'fail') return { status: 'red', output };
  }
  return { status: 'green', output };
}

function attempt({ root, base, command, overlay, runs, timeoutMs, headMs }, state) {
  try {
    state.sha = gitText(root, ['rev-parse', '--verify', `${base}^{commit}`]);
    state.holder = fs.mkdtempSync(path.join(os.tmpdir(), 'red-green-'));
    const tree = path.join(state.holder, 'tree');
    state.tree = tree;
    state.treeReal = path.join(fs.realpathSync(state.holder), 'tree');
    const added = addWorktree(root, tree, ['--detach', tree, state.sha]);
    if (!added.ok) throw new Error(added.error);
    const modules = path.join(root, 'node_modules');
    const linked = path.join(tree, 'node_modules');
    if (lstat(modules) && !lstat(linked)) fs.symlinkSync(modules, linked);
    applyOverlay(root, tree, overlay);
    return runRepeated(command, tree, { runs, timeoutMs, headMs });
  } catch (error) {
    return { status: 'error', output: String(error.stderr || error.message) };
  }
}

export function runInWorktree({ root, base, command, overlay = [], runs = 1, timeoutMs, headMs }) {
  const state = { sha: '', holder: undefined, tree: undefined, treeReal: undefined };
  const result = attempt({ root, base, command, overlay, runs, timeoutMs, headMs }, state);
  const note = cleanup(root, state);
  if (note) return { status: 'error', output: `${result.output}\n${note}`, sha: state.sha };
  return { ...result, sha: state.sha };
}
