// Keeps every checkout's `.exo/` scratch folder (lib/scratch-path.mjs) out of
// `git status` by listing it once in the repository's `info/exclude`. That file
// sits in the common git directory, so one entry covers the main checkout and
// every linked worktree, and it is never committed, so no project's
// `.gitignore` changes. The main session runs it before a worktree agent starts,
// because the agent itself may not write outside its worktree.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXCLUDE_LINE = '.exo/';

export class ScratchExcludeError extends Error {}

function excludeFile(cwd) {
  const common = spawnSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status !== 0) {
    throw new ScratchExcludeError(`${path.resolve(cwd)} is not inside a git repository`);
  }
  return path.join(common.stdout.trim(), 'info', 'exclude');
}

/** Add `.exo/` to the repository's `info/exclude` unless that exact line is there; returns the file path. */
export function excludeScratch(cwd) {
  const file = excludeFile(cwd);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes(EXCLUDE_LINE)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(file, `${separator}${EXCLUDE_LINE}\n`);
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    excludeScratch(process.cwd());
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
    process.stderr.write(`scratch-exclude: ${error.message}\n`);
    process.exitCode = 2;
  }
}
