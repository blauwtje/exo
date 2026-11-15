import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { orWhenAbsent } from '#absent-path';

export const isFileOnDisk = (file) => orWhenAbsent(() => fs.statSync(file).isFile(), false);

export function resolveClaude({ flag }) {
  if (flag !== undefined) {
    const file = path.resolve(flag);
    if (!isFileOnDisk(file)) return { refused: `no claude at ${flag}; pass --claude <path>` };
    return file.endsWith('.mjs') ? { command: process.execPath, prefix: [file] } : { command: file, prefix: [] };
  }
  const windows = process.platform === 'win32';
  const join = windows ? path.win32.join : path.posix.join;
  const directories = (process.env.PATH ?? '').split(windows ? ';' : ':').filter((entry) => entry !== '');
  const found = directories.map((directory) => join(directory, windows ? 'claude.exe' : 'claude')).find(isFileOnDisk);
  if (found !== undefined) return { command: found, prefix: [] };
  if (directories.some((directory) => isFileOnDisk(join(directory, 'claude.cmd')))) {
    return { refused: 'PATH holds only claude.cmd, which Node runs only through a shell; pass --claude <path>' };
  }
  return { refused: 'no claude on PATH; pass --claude <path>' };
}
