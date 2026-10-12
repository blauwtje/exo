import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configDirectory } from '#config-directory';

export const ATTESTATIONS_REQUIRED = 2;

export function memoryDirectory(cwd) {
  const common = spawnSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status === 0) return path.join(common.stdout.trim(), 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}
