import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { environmentMs } from './script-flags.mjs';

export const savedOutputPrefix = (agentId) => `exo-bash-${agentId}-`;

export const savedOutputDirectory = () => path.join(os.tmpdir(), 'exo-bash');

export function removeSavedOutputs({ directory = savedOutputDirectory(), olderThanMs = environmentMs('EXO_SAVED_OUTPUT_MS', 86400000), now = Date.now() } = {}) {
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    if (!name.startsWith('exo-bash-') || !name.endsWith('.log')) continue;
    const file = path.join(directory, name);
    const modified = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
    if (modified !== undefined && now - modified > olderThanMs) fs.rmSync(file, { force: true });
  }
}
