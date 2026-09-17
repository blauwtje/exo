// The harness's config directory: CLAUDE_CONFIG_DIR when set, otherwise
// ~/.claude. Every script imports it as `#config-directory` through the
// `imports` field of package.json, so no skill reaches into another skill's folder.

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function configDirectory() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
