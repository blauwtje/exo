// Where a repository's project memory lives. skills/remember/scripts/memory.mjs
// runs its CLI at module scope, so a second script cannot import this resolution
// from it; both read it here, the way lib/config-directory.mjs is shared.

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configDirectory } from '#config-directory';

// A claim is written to memory once this many sessions attested it; one
// session can mishear, two agreeing sessions rarely do.
export const ATTESTATIONS_REQUIRED = 2;

// The memory belongs to the repository, not to one branch or one worktree, so it
// sits in the common git directory every linked worktree shares. Outside a
// repository it falls back beside the savings record, keyed by the working
// directory's own name, the way a handoff does.
export function memoryDirectory(cwd) {
  const common = spawnSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status === 0) return path.join(common.stdout.trim(), 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}
