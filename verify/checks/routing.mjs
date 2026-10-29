import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { descriptionHashes } from '../../benchmarks/routing.mjs';
import { createReport } from '../report.mjs';
import { createRepository } from '../repository.mjs';

const RERUN = 'node benchmarks/routing.mjs';

function staleKeys(current, recorded) {
  return Object.keys(current).filter((key) => recorded[key] !== current[key])
    .map((key) => (recorded[key] === undefined ? `${key} (missing)` : `${key} (changed)`));
}

export function checkRouting(report, repository, { staticOnly = false } = {}) {
  const staleLevel = staticOnly ? 'WARN' : 'FAIL';
  const file = repository.join('benchmarks', 'results', 'routing.json');
  if (!fs.existsSync(file)) {
    report.result(staleLevel, 'routing', `benchmarks/results/routing.json is missing; run ${RERUN}`);
    return;
  }
  const recorded = JSON.parse(fs.readFileSync(file, 'utf8')).hashes ?? {};
  const current = descriptionHashes(repository.root);
  const stale = staleKeys(current, recorded);
  if (stale.length > 0) {
    report.result(staleLevel, 'routing', `routing result is stale for ${stale.join(', ')}; rerun ${RERUN}`);
    return;
  }
  report.result('PASS', 'routing', `${Object.keys(current).length} description hashes match benchmarks/results/routing.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = createReport();
  checkRouting(report, createRepository(path.resolve(import.meta.dirname, '..', '..')));
  process.exit(report.counts().FAIL > 0 ? 1 : 0);
}
