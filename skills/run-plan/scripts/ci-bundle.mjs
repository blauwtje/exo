import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const RESULT_REF = 'exo-result';
export const BUNDLE_FILE = 'result.bundle';

function git(root, args) {
  const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return done.status === 0 ? done.stdout.trim() : null;
}

function branchesAhead(root, base) {
  const names = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '';
  return names.split('\n').filter((name) => name !== '' && name !== RESULT_REF && git(root, ['rev-list', '--count', `${base}..${name}`]) !== '0');
}

export function bundleResult(root, base, directory) {
  const ahead = branchesAhead(root, base);
  if (ahead.length !== 1) return { branch: null, ahead };
  fs.mkdirSync(directory, { recursive: true });
  git(root, ['branch', '-f', RESULT_REF, ahead[0]]);
  const file = path.join(directory, BUNDLE_FILE);
  const made = git(root, ['bundle', 'create', file, RESULT_REF, `^${base}`]);
  return { branch: made === null ? null : ahead[0], ahead };
}
