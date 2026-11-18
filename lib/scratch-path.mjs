import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gitLine } from './git.mjs';
import { environmentMs, isMain, USAGE_EXIT } from './script-flags.mjs';

export const LEGACY_EXO_FOLDER = '.exo';

const PRIVATE_MODE = 0o700;
const DEFAULT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

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

function pruneStaleSiblings(keep) {
  const cutoff = Date.now() - environmentMs('EXO_SCRATCH_KEEP_MS', DEFAULT_KEEP_MS);
  const entries = fs.readdirSync(scratchRoot(), { withFileTypes: true, throwIfNoEntry: false }) ?? [];
  for (const entry of entries) {
    const folder = path.join(scratchRoot(), entry.name);
    if (!entry.isDirectory() || folder === keep) continue;
    const stat = fs.statSync(folder, { throwIfNoEntry: false });
    if (stat && stat.mtimeMs < cutoff) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 0 });
  }
}

export function scratchPath(cwd, sub) {
  const segments = checkedSegments(sub);
  const folder = checkoutFolder(cwd);
  const target = path.join(folder, ...segments);
  const isFile = segments.length > 0 && path.extname(segments.at(-1)) !== '';
  fs.mkdirSync(isFile ? path.dirname(target) : target, { recursive: true, mode: PRIVATE_MODE });
  pruneStaleSiblings(folder);
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
