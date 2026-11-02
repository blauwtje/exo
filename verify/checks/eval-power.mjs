import { aliasTargets, FOLLOWED_FOLDERS, importedModules } from './eval-variance.mjs';
import { benchmarkScripts, EXEMPT_HELPERS, isPaidEntry, readScript } from './paid-benchmarks.mjs';

const NAME = 'eval power';
const POWER_MODULE = 'lib/eval-stats.mjs';
const POWER_CALL = /\bpowerLine\s*\(/;

function callsPowerLine(repository, file) {
  return file !== POWER_MODULE && POWER_CALL.test(readScript(repository, file));
}

function reachesPowerLine(repository, aliases, start) {
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift();
    if (callsPowerLine(repository, file)) return true;
    for (const module of importedModules(repository, aliases, file)) {
      if (visited.has(module) || !FOLLOWED_FOLDERS.some((folder) => module.startsWith(folder))) continue;
      visited.add(module);
      queue.push(module);
    }
  }
  return false;
}

function needsPower(repository, file) {
  return EXEMPT_HELPERS[file] === undefined && isPaidEntry(readScript(repository, file));
}

export function withoutPowerLine(repository) {
  const aliases = aliasTargets(repository);
  return benchmarkScripts(repository)
    .filter((file) => needsPower(repository, file))
    .filter((file) => !reachesPowerLine(repository, aliases, file));
}

export function checkEvalPower(report, repository) {
  const missing = withoutPowerLine(repository);
  report.assert(
    missing.length === 0,
    NAME,
    'every paid benchmark entry point reaches powerLine from lib/eval-stats.mjs',
    missing.map((file) => `NO-POWER ${file}: print powerLine from lib/eval-stats.mjs in its --dry-run`).join('\n')
  );
}
