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

function securePrivateRoot() {
  const root = scratchRoot();
  try {
    fs.mkdirSync(root, { mode: PRIVATE_MODE });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory()) throw new ScratchPathError(`scratch root ${root} is not a folder; remove it`);
  if (!process.getuid) return;
  if (stat.uid !== process.getuid()) throw new ScratchPathError(`scratch root ${root} is owned by another user; remove it`);
  if (stat.mode & 0o077) fs.chmodSync(root, PRIVATE_MODE);
}

function checkoutFolder(root) {
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

export function scratchPath(cwd, sub, root = checkoutRoot(cwd)) {
  const segments = checkedSegments(sub);
  securePrivateRoot();
  const folder = checkoutFolder(root);
  const target = path.join(folder, ...segments);
  const isFile = segments.length > 0 && path.extname(segments.at(-1)) !== '';
  fs.mkdirSync(isFile ? path.dirname(target) : target, { recursive: true, mode: PRIVATE_MODE });
  pruneStaleSiblings(folder);
  return target;
}

function plainSegment(label, value) {
  if (typeof value !== 'string' || value === '' || /[\\/]/.test(value) || value.includes('..')) {
    throw new ScratchPathError(`${label} "${value}" must be one plain name with no / or ..`);
  }
  return value;
}

export function taskScratchPath(state, { planId, number }, name) {
  const plan = plainSegment('plan id', planId);
  const file = plainSegment('name', name);
  securePrivateRoot();
  const root = state.toplevel() ?? path.resolve(state.root);
  const checkout = checkoutFolder(root);
  const folder = path.join(checkout, plan, `task-${number}`);
  fs.mkdirSync(folder, { recursive: true, mode: PRIVATE_MODE });
  const now = new Date();
  fs.utimesSync(checkout, now, now);
  pruneStaleSiblings(checkout);
  return path.join(folder, file);
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
