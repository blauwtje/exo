import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '#git';
import { gitStarts } from '../git-trace.mjs';
import { BASE_REF } from './plugin-version.mjs';

const NAME = 'git once';
const BASELINE_FILE = 'verify/checks/git-once-baseline.json';
const RUN_SUFFIX = /-[A-Za-z0-9]{6}$/;
const SHA = /\b[0-9a-f]{7,40}\b/g;
const WRITES = new Set([
  'add', 'am', 'apply', 'branch', 'checkout', 'cherry-pick', 'clean', 'commit', 'commit-tree', 'fetch', 'gc', 'init',
  'maintenance', 'merge', 'mv', 'pull', 'push', 'read-tree', 'rebase', 'reset', 'restore', 'revert', 'rm', 'stash',
  'switch', 'tag', 'update-index', 'update-ref', 'worktree', 'write-tree'
]);

function argsOf(argv) {
  const rest = argv.slice(1);
  return rest[0] === '-C' ? rest.slice(2) : rest;
}

function subcommandOf(args) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-c') index += 1;
    else if (!args[index].startsWith('-')) return args[index];
  }
  return null;
}

function tempPrefixes(traceRoot) {
  const roots = [traceRoot, os.tmpdir()];
  for (const root of [...roots]) {
    if (fs.existsSync(root)) roots.push(fs.realpathSync(root));
  }
  return [...new Set(roots)];
}

function normalized(args, prefixes) {
  const words = args.map((word) => {
    const prefix = prefixes.find((candidate) => word.includes(candidate));
    return prefix === undefined ? word.replace(SHA, '<sha>') : word.slice(0, word.indexOf(prefix)) + '<tmp>';
  });
  return words.join(' ');
}

function repeatsOf(directory, prefixes) {
  const script = path.basename(directory).replace(RUN_SUFFIX, '');
  const counts = new Map();
  const repeats = new Map();
  for (const { argv } of gitStarts(directory)) {
    const args = argsOf(argv);
    if (WRITES.has(subcommandOf(args))) {
      counts.clear();
      continue;
    }
    const key = `${script}: git ${normalized(args, prefixes)}`;
    const times = (counts.get(key) ?? 0) + 1;
    counts.set(key, times);
    if (times > 1) repeats.set(key, times);
  }
  return repeats;
}

function readBaseline(text) {
  return text === null ? {} : JSON.parse(text);
}

function baselineAtMergeBase(repository) {
  const mergeBase = git(repository.root, ['merge-base', 'HEAD', BASE_REF]);
  if (mergeBase.status !== 0) return null;
  const shown = git(repository.root, ['show', `${mergeBase.stdout.trim()}:${BASELINE_FILE}`]);
  return shown.status === 0 ? readBaseline(shown.stdout) : null;
}

function ratchetProblems(baseline, before) {
  if (before === null) return [];
  return Object.entries(baseline)
    .filter(([key, entry]) => entry.count > (before[key]?.count ?? 0))
    .map(([key, entry]) => `${BASELINE_FILE} raises "${key}" to ${entry.count}`);
}

export function checkGitOnce(report, repository, traceRoot) {
  if (!traceRoot) {
    report.result('UNRUN', NAME, 'no git trace from the behavior run');
    return;
  }
  const prefixes = tempPrefixes(traceRoot);
  const found = new Map();
  for (const entry of fs.readdirSync(traceRoot)) {
    for (const [key, times] of repeatsOf(path.join(traceRoot, entry), prefixes)) {
      found.set(key, Math.max(found.get(key) ?? 0, times));
    }
  }
  fs.rmSync(traceRoot, { recursive: true, force: true });

  const file = repository.join(BASELINE_FILE);
  const baseline = readBaseline(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  const problems = ratchetProblems(baseline, baselineAtMergeBase(repository));
  for (const [key, times] of found) {
    if ((baseline[key]?.count ?? 0) >= times) continue;
    const separator = key.indexOf(': git ');
    problems.push(`${key.slice(0, separator)} runs "${key.slice(separator + 2)}" ${times} times with no git write between`);
  }
  report.assert(problems.length === 0, NAME, {
    pass: 'no script run repeats a git read with no git write between',
    fail: problems.join('; ')
  });
}
