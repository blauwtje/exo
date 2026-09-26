// A checkout's own scratch folder: `.exo/` at the top level of the working
// tree, one per checkout, so a worktree agent writes its reports inside the
// worktree it may touch rather than under `git rev-parse --git-dir`, which in a
// linked worktree lies in the main repository's `.git/worktrees/<name>`.
// Imported as `#scratch-path`; run as `node lib/scratch-path.mjs [<sub>]` it
// prints the absolute path and creates it: a `<sub>` whose last segment has an
// extension (`report.md`) names a file, so only its parent folder is created;
// one without an extension (`.gitkeep`, `debug`, `run-parallel/slug`) names a
// folder, created in full. lib/scratch-exclude.mjs keeps the folder out of
// `git status`.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SCRATCH_FOLDER = '.exo';

export class ScratchPathError extends Error {}

// `<sub>` arrives from an agent's command line, so it is a trust boundary: an
// absolute path or any `..` segment could point the write outside the checkout.
function checkedSegments(sub) {
  if (path.isAbsolute(sub) || path.win32.isAbsolute(sub)) {
    throw new ScratchPathError(`"${sub}" is absolute; give a path relative to ${SCRATCH_FOLDER}/`);
  }
  const segments = sub.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) {
    throw new ScratchPathError(`"${sub}" climbs out of ${SCRATCH_FOLDER}/; drop the .. segments`);
  }
  return segments;
}

function checkoutRoot(cwd) {
  const toplevel = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (toplevel.status !== 0) {
    throw new ScratchPathError(`${path.resolve(cwd)} is not inside a git working tree`);
  }
  return toplevel.stdout.trim();
}

/**
 * The absolute `.exo` folder of the checkout holding `cwd`, or `sub` below it.
 * A `sub` whose last segment has an extension names a file: only its parent
 * folder is created. Without an extension `sub` names a folder, created in full.
 */
export function scratchPath(cwd, sub = '') {
  const segments = checkedSegments(sub);
  const target = path.join(checkoutRoot(cwd), SCRATCH_FOLDER, ...segments);
  const isFile = segments.length > 0 && path.extname(segments.at(-1)) !== '';
  fs.mkdirSync(isFile ? path.dirname(target) : target, { recursive: true });
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${scratchPath(process.cwd(), process.argv[2] ?? '')}\n`);
  } catch (error) {
    if (!(error instanceof ScratchPathError)) throw error;
    process.stderr.write(`scratch-path: ${error.message}\n`);
    process.exitCode = 2;
  }
}
