import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { configDirectory } from '#config-directory';
import { isMain, UsageError, USAGE_EXIT } from '#script-flags';

export function handoffFile(cwd) {
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

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { cwd: { type: 'string' }, help: { type: 'boolean' } }
  });
  const [command] = positionals;
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  if (command !== 'path') throw new UsageError(`unknown command ${command ?? '(none)'}; expected path`);
  console.log(handoffFile(values.cwd ?? process.cwd()));
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (!(error instanceof UsageError) && !error.code?.startsWith('ERR_PARSE_ARGS')) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}
