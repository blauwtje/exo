import path from 'node:path';
import { configDirectory } from '#config-directory';
import { gitLine } from '#git';
import { layers, resolve } from '#settings-store';

export const ATTESTATIONS_REQUIRED = 2;

export function memoryDirectory(cwd) {
  const common = gitLine(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common !== null) return path.join(common, 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}

function settingsRoot(cwd) {
  return gitLine(cwd, ['rev-parse', '--show-toplevel']) ?? path.resolve(cwd);
}

export function memoryOn(cwd) {
  try {
    return resolve('memory', layers(settingsRoot(cwd))).value !== 'off';
  } catch {
    return true;
  }
}
