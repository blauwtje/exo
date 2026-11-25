import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { commonDir } from '#checkout';

export function configDirectory(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(env.HOME || os.homedir(), '.claude');
}

export function memoryDirectory(cwd) {
  const common = commonDir(cwd);
  if (common !== null) return path.join(common, 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}
