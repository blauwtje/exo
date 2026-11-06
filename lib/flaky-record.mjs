import path from 'node:path';
import { readJsonOrNull, writeAtomic } from '#basics';

const RECORD_FILE = path.join('.exo', 'flaky.json');
const FAILING_FILE = /^test at (\S+\.test\.m?js):\d+:\d+$/gm;
const TAP_LOCATION = /^\s*location: '(.+\.test\.m?js):\d+:\d+'$/gm;
const NODE_TEST = /^node --test(?: |$)/;

export const isNodeTest = (command) => NODE_TEST.test(command);

export function failedTestFiles(output, cwd = process.cwd()) {
  const files = new Set();
  for (const match of output.matchAll(FAILING_FILE)) files.add(match[1]);
  for (const match of output.matchAll(TAP_LOCATION)) files.add(path.relative(cwd, match[1]));
  return [...files];
}

export const readFlaky = (root) => readJsonOrNull(path.join(root, RECORD_FILE)) ?? [];

export function recordFlaky(root, files, date = new Date().toISOString().slice(0, 10)) {
  const rows = readFlaky(root);
  for (const file of files) {
    const row = rows.find((candidate) => candidate.file === file && candidate.date === date);
    if (row) row.count += 1;
    else rows.push({ file, date, count: 1 });
  }
  writeAtomic(path.join(root, RECORD_FILE), `${JSON.stringify(rows, null, 2)}\n`);
  return rows;
}
