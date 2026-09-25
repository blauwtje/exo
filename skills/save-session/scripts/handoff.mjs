// Where a handoff sits: beside the branch it belongs to, inside the
// repository's own git directory, so a linked worktree never writes another
// worktree's handoff. hooks/session-start.sh points a resuming session at the
// same file; this command is the one place both compute it, so the skill body
// no longer restates the git commands.
//
//   node handoff.mjs path [--cwd <dir>]

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { configDirectory } from '#config-directory';

function handoffFile(cwd) {
  const gitDir = spawnSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  if (gitDir.status === 0) {
    const branch = spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    const scope = branch.stdout.trim();
    return path.join(gitDir.stdout.trim(), 'exo', 'handoff', `${scope}.md`);
  }
  // Outside a repository the handoff sits beside the savings record, keyed by
  // the working directory's own name, the way a project memory falls back too.
  const scope = path.basename(path.resolve(cwd));
  return path.join(configDirectory(), 'exo', 'handoff', `${scope}.md`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { cwd: { type: 'string' } }
});

const cwd = values.cwd ?? process.cwd();
const command = positionals[0];

if (command === 'path') {
  console.log(handoffFile(cwd));
} else {
  console.error(`unknown command ${command ?? '(none)'}; expected path`);
  process.exitCode = 1;
}
