import fs from 'node:fs';
import path from 'node:path';
import { withoutComments } from '../../lib/code-comments.mjs';

const PAID_CALL = /['"]-p['"]|api\.anthropic\.com|@anthropic-ai\/sdk|\bconfinedClaude\(|\brunClaude\b/;
const ENTRY_POINT = /process\.argv/;
const DRY_RUN = /--dry-run|['"]dry-run['"]/;
const ASSIGN = String.raw`(?:\?\?|\|\||(?<![=!<>])=(?!=)|:)\s*`;
const QUICK_LITERAL = String.raw`['"\x60]quick['"\x60]`;
const QUICK_DEFAULTS = [
  new RegExp(String.raw`\b\w*(?:tier|mode)\w*\s*${ASSIGN}${QUICK_LITERAL}`, 'i'),
  new RegExp(String.raw`(?:\?\?|\|\|)\s*${QUICK_LITERAL}`),
  new RegExp(String.raw`\?[^?:;]*:\s*${QUICK_LITERAL}`),
  /\?[^?:;]*\bfull\b[^?:;]*:[^;]*\bquick\b/i,
  /\bquick\s*[:=]\s*!/,
  new RegExp(String.raw`(?:${ASSIGN}|\(\s*['"][\w-]+['"]\s*,\s*)QUICK_[A-Z_]+`)
];
const SKIPPED_FOLDERS = new Set(['fixtures', 'results', 'runs', 'value', 'node_modules']);

export const EXEMPT_HELPERS = {
  'benchmarks/confined-child.mjs': {
    callers: ['benchmarks/run.mjs', 'benchmarks/sweep.mjs'],
    reason: 'the claude wrapper that run.mjs and sweep.mjs start for a flow cell, never run by hand'
  }
};

function hasQuickDefault(code) {
  return QUICK_DEFAULTS.some((pattern) => pattern.test(code));
}

function hasBothGuards(code) {
  return DRY_RUN.test(code) && hasQuickDefault(code);
}

export function isPaidEntry(code) {
  return PAID_CALL.test(code) && ENTRY_POINT.test(code);
}

function isUnguardedPaidEntry(code) {
  return isPaidEntry(code) && !hasBothGuards(code);
}

export function benchmarkScripts(repository) {
  const root = repository.join('benchmarks');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => path.relative(repository.join('.'), path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.split('/').slice(1, -1).some((folder) => SKIPPED_FOLDERS.has(folder)))
    .sort();
}

export function readScript(repository, file) {
  const absolute = repository.join(file);
  return fs.existsSync(absolute) ? withoutComments(file, fs.readFileSync(absolute, 'utf8')) : '';
}

function isExempt(repository, file, exemptions) {
  const exemption = exemptions[file];
  if (exemption === undefined) return false;
  return exemption.callers.every((caller) => hasBothGuards(readScript(repository, caller)));
}

export function unguardedPaidBenchmarks(repository, exemptions = EXEMPT_HELPERS) {
  return benchmarkScripts(repository)
    .filter((file) => isUnguardedPaidEntry(readScript(repository, file)))
    .filter((file) => !isExempt(repository, file, exemptions));
}

function exemptionNotes(repository, exemptions) {
  return benchmarkScripts(repository)
    .filter((file) => exemptions[file] !== undefined && isUnguardedPaidEntry(readScript(repository, file)) && isExempt(repository, file, exemptions))
    .map((file) => `${file}: ${exemptions[file].reason}`);
}

export function checkPaidBenchmarks(report, repository, exemptions = EXEMPT_HELPERS) {
  const unguarded = unguardedPaidBenchmarks(repository, exemptions);
  const notes = exemptionNotes(repository, exemptions);
  const passDetail = 'every paid benchmark entry point has a --dry-run flag and a quick default tier';
  report.assert(
    unguarded.length === 0,
    'paid benchmarks',
    notes.length === 0 ? passDetail : `${passDetail}; exempt: ${notes.join('; ')}`,
    `paid benchmark without --dry-run and a quick default tier: ${unguarded.join(', ')}`
  );
}
