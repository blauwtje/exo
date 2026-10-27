// git diff --check from the merge base with origin/main to the working tree,
// so committed, staged and unstaged changes are all covered, plus a
// trailing-whitespace scan of untracked files, which git cannot see.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const TRAILING_WHITESPACE = /[ \t]+$/;
const BASE_REF = 'origin/main';

function git(repository, args) {
  return spawnSync('git', ['-C', repository.root, ...args], { encoding: 'utf8' });
}

function nonEmptyLines(text) {
  return (text ?? '').split('\n').filter((line) => line !== '');
}

function diffBase(repository) {
  const mergeBase = git(repository, ['merge-base', 'HEAD', BASE_REF]);
  if (mergeBase.status !== 0) return [];
  return [mergeBase.stdout.trim()];
}

export function checkGitWhitespace(report, repository) {
  if (git(repository, ['rev-parse', '--git-dir']).status !== 0) {
    report.result('UNRUN', 'git diff --check', 'repository root is not inside a git work tree');
    return;
  }

  const diff = git(repository, ['diff', '--check', ...diffBase(repository), '--', '.']);
  const untrackedErrors = [];
  for (const relativePath of nonEmptyLines(git(repository, ['ls-files', '--others', '--exclude-standard']).stdout)) {
    const file = repository.join(relativePath);
    if (!(fs.existsSync(file) && fs.statSync(file).isFile())) continue;
    repository.lines(file).forEach((line, index) => {
      if (TRAILING_WHITESPACE.test(line)) {
        untrackedErrors.push(`${relativePath}:${index + 1}: trailing whitespace`);
      }
    });
  }

  const detail = [...nonEmptyLines(`${diff.stdout ?? ''}${diff.stderr ?? ''}`), ...untrackedErrors];
  report.assert(
    diff.status === 0 && untrackedErrors.length === 0,
    'git diff --check',
    'no whitespace errors in tracked or untracked files',
    detail.join('; ')
  );
}
