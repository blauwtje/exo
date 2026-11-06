import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { codeStandardPath } from '../../gate/scripts/review-input.mjs';

const REVIEW_RULES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gate', 'references', 'review-rules.md');
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const USAGE = 'usage: resolve-target.mjs --root <checkout> [--target <uncommitted|base..head|commit|branch|pr number>] [--base <ref>] [--remote <name>] [--out <dir>]';
const NON_GOALS = ['Repairing any finding: repairs go through build.', 'Editing, staging or committing any file.', 'Posting to a pull request.'];

function run(command, args, { cwd, okStatus = [0] } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error || !okStatus.includes(result.status)) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout;
}

function git(root, args, options = {}) {
  return run('git', ['-C', root, ...args], options);
}

function resolves(root, ref) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isBranch(root, name) {
  const refs = [`refs/heads/${name}`, `refs/remotes/${name}`];
  return refs.some((ref) => spawnSync('git', ['-C', root, 'show-ref', '--verify', '--quiet', ref]).status === 0);
}

function defaultBase(root, remote) {
  const symbolic = spawnSync('git', ['-C', root, 'symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`], { encoding: 'utf8' });
  const candidates = [symbolic.status === 0 ? symbolic.stdout.trim().replace('refs/remotes/', '') : null, 'main', 'master'];
  const found = candidates.find((ref) => ref !== null && resolves(root, ref) !== null);
  if (!found) throw new Error('no base branch found: pass --base');
  return found;
}

function mergeBase(root, left, right) {
  return git(root, ['merge-base', left, right]).trim();
}

function untrackedFiles(root) {
  return git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}

function worktreeDiff(root, unified) {
  const tracked = git(root, ['diff', '--no-color', `-U${unified}`, 'HEAD']);
  const added = untrackedFiles(root).map((file) => git(root, ['diff', '--no-color', `-U${unified}`, '--no-index', '--', '/dev/null', file], { okStatus: [0, 1] }));
  return [tracked, ...added].join('');
}

function targetDiff(root, resolved, unified) {
  if (resolved.kind === 'uncommitted') return worktreeDiff(root, unified);
  return git(root, ['diff', '--no-color', `-U${unified}`, `${resolved.base}...${resolved.head}`]);
}

export function changedRanges(diffText) {
  const ranges = [];
  let file = null;
  for (const line of diffText.split('\n')) {
    const header = line.match(/^\+\+\+ b\/(.+)$/);
    if (header) file = header[1];
    const hunk = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (!hunk || file === null) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) ranges.push(`${file}:${start}-${start + count - 1}`);
  }
  return ranges;
}

function resolvePullRequest(root, number, remote) {
  const info = JSON.parse(run('gh', ['pr', 'view', number, '--json', 'baseRefName,headRefOid,title'], { cwd: root }));
  git(root, ['fetch', '--quiet', '--no-write-fetch-head', remote, `refs/pull/${number}/head`]);
  const base = mergeBase(root, `${remote}/${info.baseRefName}`, info.headRefOid);
  return { kind: 'pr', label: `pull request ${number}: ${info.title}`, base, head: info.headRefOid };
}

export function classify(root, target, { base, remote }) {
  if (target === undefined || target === 'uncommitted') return { kind: 'uncommitted', label: 'uncommitted work', base: resolves(root, 'HEAD'), head: null };
  const range = target.match(/^(.+?)\.\.\.?(.+)$/);
  if (range) {
    const [left, right] = [resolves(root, range[1]), resolves(root, range[2])];
    if (!left || !right) throw new Error(`cannot resolve range ${target}`);
    return { kind: 'range', label: `range ${target}`, base: mergeBase(root, left, right), head: right };
  }
  const number = /^#?\d+$/.test(target) ? target.replace('#', '') : null;
  const commit = resolves(root, target);
  if (number !== null && !(number.length >= 7 && commit)) return resolvePullRequest(root, number, remote);
  if (!commit) throw new Error(`cannot resolve target ${target}`);
  if (isBranch(root, target)) return { kind: 'branch', label: `branch ${target}`, base: mergeBase(root, base ?? defaultBase(root, remote), commit), head: commit };
  return { kind: 'commit', label: `commit ${commit.slice(0, 12)}`, base: resolves(root, `${commit}^`) ?? EMPTY_TREE, head: commit };
}

function exportTree(root, head, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const archive = spawnSync('git', ['-C', root, 'archive', head], { maxBuffer: 1024 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(`git archive ${head} failed`);
  const extract = spawnSync('tar', ['-x', '-C', directory], { input: archive.stdout });
  if (extract.status !== 0) throw new Error('tar extract failed');
}

function inputText({ label, diff, root }) {
  return [
    '## Goal', `Review ${label} for defects, on its changed lines only.`, '',
    '## Non-goals', ...NON_GOALS.map((goal) => `- ${goal}`), '',
    '## Branch diff', '```diff', diff.trimEnd(), '```', '',
    '## Red lines', 'none', '',
    '## Boundaries', 'none', '',
    `code-standard=${codeStandardPath(root)}`, ''
  ].join('\n');
}

export function resolveTarget(root, { target, base, remote = 'origin', out }) {
  const resolved = classify(root, target, { base, remote });
  const uncommitted = resolved.kind === 'uncommitted';
  const diff = targetDiff(root, resolved, 3);
  const lines = [`TARGET kind=${resolved.kind} base=${resolved.base} head=${uncommitted ? 'worktree' : resolved.head}`];
  if (diff.trim() === '') return [...lines, 'EMPTY nothing changed in this target'];
  const directory = out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'exo-review-'));
  fs.mkdirSync(directory, { recursive: true });
  const checkout = uncommitted ? root : path.join(directory, 'checkout');
  if (!uncommitted) exportTree(root, resolved.head, checkout);
  const input = path.join(directory, 'review-input.md');
  fs.writeFileSync(input, inputText({ label: resolved.label, diff, root }));
  const fields = [
    `code-standard=${codeStandardPath(root)}`, `review-rules=${REVIEW_RULES}`, `plan=${input}`, `checkout=${checkout}`, `base=${resolved.base}`,
    `scope=branch ${resolved.base}..${uncommitted ? 'HEAD' : resolved.head}`, `input=${input}`, `findings=${path.join(directory, 'review-findings.md')}`
  ];
  const ranges = changedRanges(targetDiff(root, resolved, 0));
  return [...lines, `DISPATCH Review: ${fields.join(' ')}`, ...ranges.map((range) => `CHANGED ${range}`)];
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value', target: 'value', base: 'value', remote: 'value', out: 'value' }, { usage: USAGE });
  if (!flags.root) throw new UsageError('--root is required');
  const lines = resolveTarget(path.resolve(flags.root), { target: flags.target, base: flags.base, remote: flags.remote, out: flags.out });
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`resolve-target: ${error.message}\n`);
    process.exitCode = 2;
  }
}
