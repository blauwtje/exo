// git diff --check over tracked files, plus a trailing-whitespace scan of
// untracked ones, which git cannot see.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const TRAILING_WHITESPACE = /[ \t]+$/;

function git(repository, args) {
  return spawnSync('git', ['-C', repository.root, ...args], { encoding: 'utf8' });
}

function nonEmptyLines(text) {
  return (text ?? '').split('\n').filter((line) => line !== '');
}

export function checkGitWhitespace(report, repository) {
  if (git(repository, ['rev-parse', '--git-dir']).status !== 0) {
    report.result('UNRUN', 'git diff --check', 'repository root is not inside a git work tree');
    return;
  }

  const diff = git(repository, ['diff', '--check', '--', '.']);
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
