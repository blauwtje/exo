import { execFileSync } from 'node:child_process';

export function pluginDirty(directories) {
  const dirty = {};
  for (const directory of directories) {
    const status = execFileSync('git', ['-C', directory, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    dirty[directory] = status.trim() !== '';
  }
  return dirty;
}
