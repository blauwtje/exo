import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function configDirectory() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
