import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import os from 'node:os';
import { currentHost } from '#host';

function configDirectory() {
  return currentHost() === 'codex'
    ? process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
    : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function handoffFile(cwd) {
  const gitDir = spawnSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  if (gitDir.status === 0) {
    const branch = spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    const scope = branch.stdout.trim();
    return path.join(gitDir.stdout.trim(), 'exo', 'handoff', `${scope}.md`);
  }
  const scope = path.basename(path.resolve(cwd));
  return path.join(configDirectory(), 'exo', 'handoff', `${scope}.md`);
}

const USAGE = 'usage: node handoff.mjs path [--cwd <dir>]\nPrints where the handoff of the current branch sits, inside the repository\'s git directory.';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { cwd: { type: 'string' }, help: { type: 'boolean' } }
});

const cwd = values.cwd ?? process.cwd();
const command = positionals[0];

if (values.help) {
  console.log(USAGE);
} else if (command === 'path') {
  console.log(handoffFile(cwd));
} else {
  console.error(`unknown command ${command ?? '(none)'}; expected path`);
  process.exitCode = 1;
}
