import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gitLine } from './git.mjs';
import { isMain } from './script-flags.mjs';

export const EXCLUDE_LINE = '.exo/';

export class ScratchExcludeError extends Error {}

function excludeFile(cwd) {
  const common = gitLine(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common === null) {
    throw new ScratchExcludeError(`${path.resolve(cwd)} is not inside a git repository`);
  }
  return path.join(common, 'info', 'exclude');
}

export function excludeScratch(cwd) {
  const file = excludeFile(cwd);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes(EXCLUDE_LINE)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(file, `${separator}${EXCLUDE_LINE}\n`);
  return file;
}

if (isMain(import.meta.url)) {
  try {
    excludeScratch(process.cwd());
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
    process.stderr.write(`scratch-exclude: ${error.message}\n`);
    process.exitCode = 2;
  }
}
