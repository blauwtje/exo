import path from 'node:path';
import { commonDir } from '#checkout';
import { configDirectory } from '#config-directory';

export function memoryDirectory(cwd) {
  const common = commonDir(cwd);
  if (common !== null) return path.join(common, 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}
