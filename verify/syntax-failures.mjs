import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PARSER = path.join(import.meta.dirname, 'parse-scripts.mjs');
const FLAGS = ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'];
const parsed = new Map();

function stamp(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? `${file}\0${stat.mtimeMs}\0${stat.size}` : file;
}

function parseAll(files) {
  const parse = spawnSync(process.execPath, [...FLAGS, PARSER], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (parse.status === 0) return JSON.parse(parse.stdout);
  return [{ file: PARSER, message: `the parser stopped: ${`${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim()}` }];
}

export function syntaxFailures(files) {
  const pending = files.filter((file) => !parsed.has(stamp(file)));
  if (pending.length === 0) return files.flatMap((file) => parsed.get(stamp(file)));
  const failures = parseAll(pending);
  if (failures.some((failure) => failure.file === PARSER)) return failures;
  for (const file of pending) parsed.set(stamp(file), failures.filter((failure) => failure.file === file));
  return files.flatMap((file) => parsed.get(stamp(file)));
}
