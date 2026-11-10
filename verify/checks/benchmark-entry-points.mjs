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
const VARIANCE_MODULES = new Set(['benchmarks/statistics.mjs', 'lib/eval-stats.mjs']);
const FOLLOWED_FOLDERS = ['benchmarks/', 'lib/'];
const SCORER_NAME = /^score\.mjs$|-(?:score|stats|report|readout|metrics|summary)\.mjs$/;
const SPECIFIER = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
const POWER_MODULE = 'lib/eval-stats.mjs';
const POWER_CALL = /\bpowerLine\s*\(/;
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

function aliasTargets(repository) {
  const manifest = repository.join('package.json');
  if (!fs.existsSync(manifest)) return {};
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).imports ?? {};
}

function aliasTarget(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return null;
  return aliasTarget(value.default ?? Object.values(value)[0]);
}

function resolveSpecifier(repository, aliases, from, specifier) {
  if (specifier.startsWith('.')) return repository.relative(path.resolve(path.dirname(repository.join(from)), specifier));
  if (!specifier.startsWith('#')) return null;
  const target = aliasTarget(aliases[specifier]);
  return target === null ? null : repository.relative(repository.join(target));
}

function importedModules(repository, aliases, file) {
  const code = readScript(repository, file);
  return [...code.matchAll(SPECIFIER)]
    .map((match) => resolveSpecifier(repository, aliases, file, match[1] ?? match[2]))
    .filter((module) => module !== null);
}

function reaches(repository, aliases, start, isTarget) {
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift();
    if (isTarget(file)) return true;
    for (const module of importedModules(repository, aliases, file)) {
      if (visited.has(module) || !FOLLOWED_FOLDERS.some((folder) => module.startsWith(folder))) continue;
      visited.add(module);
      queue.push(module);
    }
  }
  return false;
}

export function isScorer(file) {
  return SCORER_NAME.test(path.posix.basename(file));
}

function importsVarianceModule(repository, aliases, file) {
  return importedModules(repository, aliases, file).some((module) => VARIANCE_MODULES.has(module));
}

function callsPowerLine(repository, file) {
  return file !== POWER_MODULE && POWER_CALL.test(readScript(repository, file));
}

function isExempt(repository, file, exemptions) {
  const exemption = exemptions[file];
  if (exemption === undefined) return false;
  return exemption.callers.every((caller) => hasBothGuards(readScript(repository, caller)));
}

function scanBenchmarks(repository) {
  return {
    aliases: aliasTargets(repository),
    scripts: benchmarkScripts(repository).map((file) => ({ file, code: readScript(repository, file) }))
  };
}

export function unguardedPaidBenchmarks(repository, exemptions = EXEMPT_HELPERS, scan = scanBenchmarks(repository)) {
  return scan.scripts
    .filter(({ code }) => isUnguardedPaidEntry(code))
    .filter(({ file }) => !isExempt(repository, file, exemptions))
    .map(({ file }) => file);
}

export function withoutVarianceGate(repository, scan = scanBenchmarks(repository)) {
  return scan.scripts
    .filter(({ file, code }) => EXEMPT_HELPERS[file] === undefined && (isScorer(file) || isPaidEntry(code)))
    .filter(({ file }) => !reaches(repository, scan.aliases, file, (visited) => importsVarianceModule(repository, scan.aliases, visited)))
    .map(({ file }) => file);
}

export function withoutPowerLine(repository, scan = scanBenchmarks(repository)) {
  return scan.scripts
    .filter(({ file, code }) => EXEMPT_HELPERS[file] === undefined && isPaidEntry(code))
    .filter(({ file }) => !reaches(repository, scan.aliases, file, (visited) => callsPowerLine(repository, visited)))
    .map(({ file }) => file);
}

function exemptionNotes(repository, exemptions, scan) {
  return scan.scripts
    .filter(({ file, code }) => exemptions[file] !== undefined && isUnguardedPaidEntry(code) && isExempt(repository, file, exemptions))
    .map(({ file }) => `${file}: ${exemptions[file].reason}`);
}

export function checkBenchmarkEntryPoints(report, repository, exemptions = EXEMPT_HELPERS) {
  const scan = scanBenchmarks(repository);
  const unguarded = unguardedPaidBenchmarks(repository, exemptions, scan);
  const notes = exemptionNotes(repository, exemptions, scan);
  const passDetail = 'every paid benchmark entry point has a --dry-run flag and a quick default tier';
  report.assert(
    unguarded.length === 0,
    'paid benchmarks',
    notes.length === 0 ? passDetail : `${passDetail}; exempt: ${notes.join('; ')}`,
    `paid benchmark without --dry-run and a quick default tier: ${unguarded.join(', ')}`
  );
  const noVariance = withoutVarianceGate(repository, scan);
  report.assert(
    noVariance.length === 0,
    'eval variance',
    'every benchmark scorer and paid entry point reaches benchmarks/statistics.mjs or lib/eval-stats.mjs',
    noVariance.map((file) => `NO-VARIANCE ${file}: import a variance or noise gate from benchmarks/statistics.mjs or lib/eval-stats.mjs`).join('\n')
  );
  const noPower = withoutPowerLine(repository, scan);
  report.assert(
    noPower.length === 0,
    'eval power',
    'every paid benchmark entry point reaches powerLine from lib/eval-stats.mjs',
    noPower.map((file) => `NO-POWER ${file}: print powerLine from lib/eval-stats.mjs in its --dry-run`).join('\n')
  );
}
