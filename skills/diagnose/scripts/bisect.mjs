#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = [
  'Usage: node bisect.mjs --repro <command>',
  'Runs <command> in a temporary worktree, finds the newest good commit it passes at (merge-base with origin/HEAD, else HEAD~1, ~2, ~4, ... back to the root),',
  'and bisects to the first bad commit. Prints First bad, Good and the changed files; a repro that passes at HEAD or cannot be bisected prints one Bisect: line and exits 1.'
].join('\n');

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const text = (result) => result.stdout.trim();
const passes = (cwd, command) => spawnSync('sh', ['-c', command], { cwd, stdio: 'ignore' }).status === 0;

function goodRef(worktree, command) {
  const base = git(worktree, 'merge-base', 'HEAD', 'origin/HEAD');
  if (base.status === 0 && text(base) !== text(git(worktree, 'rev-parse', 'HEAD'))) return text(base);
  const count = Number(text(git(worktree, 'rev-list', '--count', 'HEAD')));
  for (let back = 1; back < count + 1; back *= 2) {
    const ref = `HEAD~${Math.min(back, count - 1)}`;
    git(worktree, 'checkout', '-q', '--detach', ref);
    const ok = passes(worktree, command);
    git(worktree, 'checkout', '-q', '--detach', 'HEAD@{1}');
    if (ok) return text(git(worktree, 'rev-parse', ref));
    if (back >= count - 1) break;
  }
  return null;
}

function bisect(command) {
  const top = text(git(process.cwd(), 'rev-parse', '--show-toplevel'));
  const worktree = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bisect-')), 'tree');
  git(top, 'worktree', 'add', '--detach', worktree, 'HEAD');
  try {
    if (passes(worktree, command)) return 'Bisect: the repro passes at HEAD, so there is nothing to bisect';
    const good = goodRef(worktree, command);
    if (good === null) return 'Bisect: no commit in history passes the repro';
    git(worktree, 'checkout', '-q', '--detach', 'HEAD');
    git(worktree, 'bisect', 'start', 'HEAD', good);
    const run = git(worktree, 'bisect', 'run', 'sh', '-c', command);
    const bad = /^([0-9a-f]{40}) is the first bad commit/m.exec(run.stdout)?.[1];
    if (!bad) return 'Bisect: the repro cannot be bisected (its result alternates or every run was skipped)';
    const files = text(git(worktree, 'show', '--name-only', '--format=', bad));
    return [`First bad: ${text(git(worktree, 'log', '-1', '--format=%h %s', bad))}`, `Good: ${good.slice(0, 7)}`, `Files:\n${files}`].join('\n');
  } finally {
    git(worktree, 'bisect', 'reset');
    git(top, 'worktree', 'remove', '--force', worktree);
  }
}

function main(argv) {
  const flags = parseFlags(argv, { repro: 'value' }, { usage: USAGE });
  if (!flags.repro) throw new UsageError('--repro <command> is required');
  const report = bisect(flags.repro);
  console.log(report);
  if (report.startsWith('Bisect:')) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}
