import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configDirectory } from '#config-directory';
import { layers, resolve } from '#settings-store';

export const ATTESTATIONS_REQUIRED = 2;

export function memoryDirectory(cwd) {
  const common = spawnSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status === 0) return path.join(common.stdout.trim(), 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}

function settingsRoot(cwd) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return top.status === 0 ? top.stdout.trim() : path.resolve(cwd);
}

export function memoryOn(cwd) {
  try {
    return resolve('memory', layers(settingsRoot(cwd))).value !== 'off';
  } catch {
    return true;
  }
}
