// Where a repository's project memory lives, and the log that records what the
// nudge hook fired on. skills/memory/scripts/memory.mjs runs its CLI at module
// scope, so a second script cannot import this resolution from it; both read it
// here, the way lib/config-directory.mjs is shared.

import fs from 'node:fs';
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

export function nudgeLogFile(cwd) {
  return path.join(memoryDirectory(cwd), 'nudge-log.jsonl');
}

// Append-only: the log is the record of what the marker list fired on, and a
// rewritten line is a measurement nobody can check afterwards.
export function appendNudgeLog(cwd, entry) {
  const file = nudgeLogFile(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const dated = { date: new Date().toISOString().slice(0, 10), ...entry };
  fs.appendFileSync(file, `${JSON.stringify(dated)}\n`);
}
