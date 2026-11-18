import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { LEGACY_EXO_FOLDER } from '#scratch-path';

export function nestedWorktrees(root) {
  const listed = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (listed.status !== 0) return new Set();
  return new Set(listed.stdout.split('\n').filter((line) => line.startsWith('worktree ')).flatMap((line) => (
    orWhenAbsent(() => [realpathSync(line.slice('worktree '.length))], [])
  )));
}

function untrackedPaths(root) {
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n')
    .filter((file) => file === '' || !worktrees.has(path.join(top, file.replace(/\/$/, ''))));
}

export function changedPaths(root, planPath) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const legacyPrefix = `${LEGACY_EXO_FOLDER}/`;
  const exempt = planPath === undefined ? [] : [path.relative(path.resolve(root), path.resolve(planPath))];
  return [...new Set([...tracked.split('\n'), ...untrackedPaths(root)])]
    .filter((line) => line !== '' && !line.startsWith(legacyPrefix) && !exempt.includes(line));
}

const ABSENT_CODES = ['ENOENT', 'ENOTDIR'];

function orWhenAbsent(read, fallback) {
  try {
    return read();
  } catch (error) {
    if (!ABSENT_CODES.includes(error.code)) throw error;
    return fallback;
  }
}
