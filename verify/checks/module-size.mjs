import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MODULE_FILE_CAP } from '../budgets.mjs';

export const CEILINGS_FILE = 'verify/module-size-ceilings.txt';
const CHECK_NAME = 'module file size';

function moduleFiles(root) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '*.mjs'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) return [];
  return listed.stdout.split('\n').filter((name) => name !== '' && !name.startsWith('tests/') && fs.existsSync(path.join(root, name)));
}

export function readCeilings(root) {
  const file = path.join(root, CEILINGS_FILE);
  if (!fs.existsSync(file)) return new Map();
  const rows = fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  return new Map(rows.map((line) => line.split(/\s+/)).map(([bytes, name]) => [name, Number(bytes)]));
}

function ceilingProblem(name, bytes, ceiling) {
  if (ceiling === undefined) return bytes > MODULE_FILE_CAP.bytes ? `${name} is ${bytes} bytes, over the ${MODULE_FILE_CAP.bytes}-byte cap: split it` : null;
  if (bytes > ceiling) return `${name} grew to ${bytes} bytes past its ${ceiling}-byte ceiling: split it`;
  if (bytes <= MODULE_FILE_CAP.bytes) return `${name} is ${bytes} bytes, within the cap: remove its line from ${CEILINGS_FILE}`;
  if (bytes < ceiling) return `${name} shrank to ${bytes} bytes: lower its ceiling in ${CEILINGS_FILE} to ${bytes}`;
  return null;
}

export function moduleSizeProblems(root) {
  const ceilings = readCeilings(root);
  const files = moduleFiles(root);
  const present = new Set(files);
  const problems = files.map((name) => ceilingProblem(name, fs.statSync(path.join(root, name)).size, ceilings.get(name))).filter(Boolean);
  const gone = [...ceilings.keys()].filter((name) => !present.has(name)).map((name) => `${name} is gone: remove its line from ${CEILINGS_FILE}`);
  return { count: files.length, problems: [...problems, ...gone] };
}

export function checkModuleSize(report, repository) {
  const { count, problems } = moduleSizeProblems(repository.root);
  report.assert(
    problems.length === 0,
    CHECK_NAME,
    `${count} modules within the ${MODULE_FILE_CAP.bytes}-byte cap or their ${CEILINGS_FILE} ceiling`,
    problems.join('; ')
  );
}
