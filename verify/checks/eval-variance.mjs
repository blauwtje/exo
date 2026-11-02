import fs from 'node:fs';
import path from 'node:path';
import { benchmarkScripts, EXEMPT_HELPERS, isPaidEntry, readScript } from './paid-benchmarks.mjs';

const NAME = 'eval variance';
const VARIANCE_MODULES = new Set(['benchmarks/statistics.mjs', 'lib/eval-stats.mjs']);
export const FOLLOWED_FOLDERS = ['benchmarks/', 'lib/'];
const SCORER_NAME = /^score\.mjs$|-(?:score|stats|report|readout|metrics|summary)\.mjs$/;
const SPECIFIER = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

export function aliasTargets(repository) {
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

export function importedModules(repository, aliases, file) {
  const code = readScript(repository, file);
  return [...code.matchAll(SPECIFIER)]
    .map((match) => resolveSpecifier(repository, aliases, file, match[1] ?? match[2]))
    .filter((module) => module !== null);
}

function reachesVariance(repository, aliases, start) {
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    for (const module of importedModules(repository, aliases, queue.shift())) {
      if (VARIANCE_MODULES.has(module)) return true;
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

function needsVariance(repository, file) {
  if (EXEMPT_HELPERS[file] !== undefined) return false;
  return isScorer(file) || isPaidEntry(readScript(repository, file));
}

export function withoutVarianceGate(repository) {
  const aliases = aliasTargets(repository);
  return benchmarkScripts(repository)
    .filter((file) => needsVariance(repository, file))
    .filter((file) => !reachesVariance(repository, aliases, file));
}

export function checkEvalVariance(report, repository) {
  const missing = withoutVarianceGate(repository);
  report.assert(
    missing.length === 0,
    NAME,
    'every benchmark scorer and paid entry point reaches benchmarks/statistics.mjs or lib/eval-stats.mjs',
    missing.map((file) => `NO-VARIANCE ${file}: import a variance or noise gate from benchmarks/statistics.mjs or lib/eval-stats.mjs`).join('\n')
  );
}
