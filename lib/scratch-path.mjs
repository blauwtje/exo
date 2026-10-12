import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { isMain } from './script-flags.mjs';

export const SCRATCH_FOLDER = '.exo';

export class ScratchPathError extends Error {}

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

export function scratchPath(cwd, sub = '') {
  const segments = checkedSegments(sub);
  const target = path.join(checkoutRoot(cwd), SCRATCH_FOLDER, ...segments);
  const isFile = segments.length > 0 && path.extname(segments.at(-1)) !== '';
  fs.mkdirSync(isFile ? path.dirname(target) : target, { recursive: true });
  return target;
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(`${scratchPath(process.cwd(), process.argv[2] ?? '')}\n`);
  } catch (error) {
    if (!(error instanceof ScratchPathError)) throw error;
    process.stderr.write(`scratch-path: ${error.message}\n`);
    process.exitCode = 2;
  }
}
