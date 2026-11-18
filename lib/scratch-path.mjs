import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gitLine } from './git.mjs';
import { isMain, USAGE_EXIT } from './script-flags.mjs';

export const LEGACY_EXO_FOLDER = '.exo';

const PRIVATE_MODE = 0o700;

export class ScratchPathError extends Error {}

function checkedSegments(sub) {
  if (path.isAbsolute(sub) || path.win32.isAbsolute(sub)) {
    throw new ScratchPathError(`"${sub}" is absolute; give a relative path`);
  }
  const segments = sub.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) {
    throw new ScratchPathError(`"${sub}" climbs out of the scratch folder; drop the .. segments`);
  }
  return segments;
}

function checkoutRoot(cwd) {
  return gitLine(cwd, ['rev-parse', '--show-toplevel']) ?? path.resolve(cwd);
}

function scratchRoot() {
  return path.join(os.tmpdir(), `exo-${os.userInfo().username}`);
}

function checkoutFolder(cwd) {
  const root = checkoutRoot(cwd);
  const hash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 8);
  return path.join(scratchRoot(), `${path.basename(root)}-${hash}`);
}

export function scratchPath(cwd, sub) {
  const segments = checkedSegments(sub);
  const target = path.join(checkoutFolder(cwd), ...segments);
  const isFile = segments.length > 0 && path.extname(segments.at(-1)) !== '';
  fs.mkdirSync(isFile ? path.dirname(target) : target, { recursive: true, mode: PRIVATE_MODE });
  return target;
}

function run() {
  try {
    process.stdout.write(`${scratchPath(process.cwd(), process.argv[2] ?? '')}\n`);
  } catch (error) {
    if (!(error instanceof ScratchPathError)) throw error;
    process.stderr.write(`scratch-path: ${error.message}\n`);
    process.exitCode = USAGE_EXIT;
  }
}

if (isMain(import.meta.url)) run();
