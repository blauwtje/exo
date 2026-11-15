import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

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

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;

export function onPath(command, env = process.env) {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  const folders = (env.PATH ?? '').split(path.delimiter).filter((folder) => folder !== '');
  return folders.some((folder) => extensions.some((extension) => isFile(path.join(folder, `${command}${extension}`))));
}
