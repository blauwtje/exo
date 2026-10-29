import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { exportSignatures } from '#export-signatures';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { parseFlags, UsageError, isMain } from '#script-flags';

const USAGE = `Usage: node review-overlap.mjs --base <ref> [--root <dir>]
Lists files and exported signatures that more than one landed task changed.
Prints OVERLAP <path> (Tasks a, b), OVERLAP <file>:<name> (Tasks a, b) or OVERLAP none.
Only commits with a Plan-task: trailer count.`;

function signatureTexts(source) {
  return new Map([...exportSignatures(source)].map(([name, shape]) => [name, shape.text]));
}

function changedNames({ path, before, after }) {
  if (!SCRIPT_EXTENSIONS.has(extname(path))) return [];
  const old = signatureTexts(before);
  const now = signatureTexts(after);
  return [...new Set([...old.keys(), ...now.keys()])].filter((name) => old.get(name) !== now.get(name));
}

const taskList = (tasks) => [...tasks].sort((a, b) => a - b);

export function findOverlaps(changes) {
  const byPath = new Map();
  for (const change of changes) {
    if (!byPath.has(change.path)) byPath.set(change.path, new Set());
    byPath.get(change.path).add(change.task);
  }
  const found = new Map();
  for (const [path, tasks] of byPath) {
    if (tasks.size > 1) found.set(path, tasks);
  }
  for (const change of changes) {
    for (const name of changedNames(change)) {
      const word = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
      const users = changes.filter((other) => other.task !== change.task && word.test(other.added));
      if (users.length === 0) continue;
      const target = `${change.path}:${name}`;
      if (!found.has(target)) found.set(target, new Set());
      found.get(target).add(change.task);
      for (const user of users) found.get(target).add(user.task);
    }
  }
  return [...found].map(([target, tasks]) => ({ target, tasks: taskList(tasks) }));
}

export function formatOverlaps(overlaps) {
  if (overlaps.length === 0) return 'OVERLAP none';
  return overlaps.map(({ target, tasks }) => `OVERLAP ${target} (Tasks ${tasks.join(', ')})`).join('\n');
}

function gitOrEmpty(root, args) {
  try {
    return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  } catch {
    return '';
  }
}

function gitOrThrow(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
}

export function readChanges(base, root = process.cwd()) {
  const format = '%x1e%H%x1f%(trailers:key=Plan-task,valueonly)';
  const log = gitOrThrow(root, ['log', '--no-merges', `--format=${format}`, `${base}..HEAD`]);
  const changes = [];
  for (const entry of log.split('\x1e').slice(1)) {
    const [hash, trailer] = entry.split('\x1f');
    const task = Number(trailer.trim().split('/').pop());
    if (!Number.isInteger(task) || trailer.trim() === '') continue;
    const names = gitOrEmpty(root, ['show', '--format=', '--name-only', hash]).split('\n').filter((name) => name !== '');
    for (const path of names) {
      const patch = gitOrEmpty(root, ['show', '--format=', '-U0', hash, '--', path]);
      const added = patch.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
      changes.push({ task, path, before: gitOrEmpty(root, ['show', `${hash}^:${path}`]), after: gitOrEmpty(root, ['show', `${hash}:${path}`]), added });
    }
  }
  return changes;
}

if (isMain(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), { base: 'string', root: 'string' }, { usage: USAGE });
    if (!flags.base) throw new UsageError('--base <ref> is required');
    process.stdout.write(`${formatOverlaps(findOverlaps(readChanges(flags.base, flags.root)))}\n`);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`review-overlap: ${error.message}\n`);
    process.exitCode = 2;
  }
}
