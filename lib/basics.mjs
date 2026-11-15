import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

export const tmpStateFile = (kind, id) => path.join(os.tmpdir(), `exo-${kind}-${String(id).replace(/[^\w-]/g, '_')}`);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

export function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const CATALOG = new URL('./run-providers.json', import.meta.url);

const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;

export const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

function readDefault(file, key, accepts) {
  const value = readJsonOrNull(file)?.defaults?.[key];
  return accepts(value) ? value : null;
}

export function runDefault(key, home, accepts = isPositiveNumber) {
  return readDefault(path.join(home, '.config', 'exo', 'run.json'), key, accepts) ?? readDefault(CATALOG, key, accepts);
}

const UNSPAWNABLE_CODES = new Set(['ENOENT', 'EACCES']);

export function isCommandFailure(error) {
  return UNSPAWNABLE_CODES.has(error.code) || Number.isInteger(error.status) || Number.isInteger(error.code);
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function skillBaseDirs(text) {
  return Array.from(text.matchAll(/^Base directory for this skill: (.+)$/gm), (match) => match[1].trim());
}
