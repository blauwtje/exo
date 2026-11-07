import fs from 'node:fs';
import path from 'node:path';
import { gitLine } from '#git';

export const RESULT_REF = 'exo-result';
export const BUNDLE_FILE = 'result.bundle';

function branchesAhead(root, base) {
  const names = gitLine(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '';
  return names.split('\n').filter((name) => name !== '' && name !== RESULT_REF && gitLine(root, ['rev-list', '--count', `${base}..${name}`]) !== '0');
}

export function bundleResult(root, base, directory) {
  const ahead = branchesAhead(root, base);
  if (ahead.length !== 1) return { branch: null, ahead };
  fs.mkdirSync(directory, { recursive: true });
  gitLine(root, ['branch', '-f', RESULT_REF, ahead[0]]);
  const file = path.join(directory, BUNDLE_FILE);
  const made = gitLine(root, ['bundle', 'create', file, RESULT_REF, `^${base}`]);
  return { branch: made === null ? null : ahead[0], ahead };
}
