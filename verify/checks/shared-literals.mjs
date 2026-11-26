import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listedFiles } from './script-syntax.mjs';

const MODULE_FILE = 'lib/shared-values.mjs';
const BASELINE_FILE = 'verify/checks/shared-literals-baseline.json';
const CODE_FILE = /^(lib\/|skills\/[^/]+\/scripts\/|verify\/|hooks\/|evals\/[^/]+\.mjs$|verify\.mjs$)/;
const STRING_MARKS = /[/.\-: ]/;

function leavesOf(value, name) {
  if (Array.isArray(value)) return value.flatMap((member) => leavesOf(member, name));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, member]) => leavesOf(member, `${name}.${key}`));
  return [{ name, value }];
}

function scannedLeaves(sharedValues) {
  return Object.entries(sharedValues).flatMap(([name, value]) => leavesOf(value, name)).filter(({ value }) => {
    if (typeof value === 'string') return STRING_MARKS.test(value);
    return Number.isInteger(value) && String(value).length >= 4;
  });
}

function countIn(text, value) {
  if (typeof value === 'string') return text.split(value).length - 1;
  const tokens = text.match(/(?<![\w.])\d[\d_]*(?!\w|\.\d)/g) ?? [];
  return tokens.filter((token) => Number(token.replaceAll('_', '')) === value && /^\d+$/.test(token.replaceAll('_', ''))).length;
}

function baselineOf(repository) {
  const file = repository.join(BASELINE_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

async function problemsOf(repository) {
  const baseline = baselineOf(repository);
  const leaves = scannedLeaves(await import(pathToFileURL(path.join(repository.root, MODULE_FILE)).href));
  const files = listedFiles(repository, (entry) => entry.endsWith('.mjs') && CODE_FILE.test(entry) && entry !== MODULE_FILE);
  return files.flatMap((file) => {
    const relative = repository.relative(file);
    const text = fs.readFileSync(file, 'utf8');
    return leaves.flatMap(({ name, value }) => {
      const allowed = baseline.find((entry) => entry.file === relative && entry.literal === value)?.count ?? 0;
      const excess = countIn(text, value) - allowed;
      return Array.from({ length: Math.max(excess, 0) }, () => `${relative}: ${value} (${name})`);
    });
  });
}

export async function checkSharedLiterals(report, repository) {
  const problems = await problemsOf(repository);
  report.assert(
    problems.length === 0,
    'shared literals',
    { pass: 'no shared value is typed outside its module', fail: problems.join('; ') }
  );
}
