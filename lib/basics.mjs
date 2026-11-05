import fs from 'node:fs';
import path from 'node:path';

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

export function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
