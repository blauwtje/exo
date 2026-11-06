import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const PARSER = path.join(import.meta.dirname, 'parse-scripts.mjs');
const FLAGS = ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'];

export function syntaxFailures(files) {
  const parse = spawnSync(process.execPath, [...FLAGS, PARSER], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (parse.status === 0) return JSON.parse(parse.stdout);
  return [{ file: PARSER, message: `the parser stopped: ${`${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim()}` }];
}
