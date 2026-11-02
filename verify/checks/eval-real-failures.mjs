import fs from 'node:fs';
import path from 'node:path';
import { evalDefaults } from '../../lib/eval-stats.mjs';

const NAME = 'eval real failures';
export const MIN_REAL_FAILURES = evalDefaults().realFailuresMin;
export const REPLAY_CASES_FOLDER = 'benchmarks/replay/cases';
export const ADHD_CASES_FILE = 'benchmarks/adhd/cases.jsonl';
export const ADHD_FAILURE_SOURCES = ['failure-chat'];
export const REAL_PROVENANCE_TYPES = ['fix-commit', 'run-dir', 'transcript'];
export const CONTROL_PROVENANCE_TYPE = 'control';
export const COUNTED_KIND = 'case';
const COMMIT_REF = /^[0-9a-f]{40}$/;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function replayCases(repository) {
  const folder = repository.join(REPLAY_CASES_FOLDER);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, definition: readJson(path.join(folder, entry.name, 'case.json')) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function provenanceProblem(definition) {
  const provenance = definition?.provenance;
  if (provenance === undefined || provenance === null || typeof provenance !== 'object') return 'no provenance object in case.json';
  const allowed = [...REAL_PROVENANCE_TYPES, CONTROL_PROVENANCE_TYPE];
  if (!allowed.includes(provenance.type)) return `provenance type '${provenance.type}' is not one of ${allowed.join(', ')}`;
  if (typeof provenance.ref !== 'string' || provenance.ref.trim() === '') return 'provenance ref is empty';
  if (provenance.type === 'fix-commit' && !COMMIT_REF.test(provenance.ref)) return `provenance ref '${provenance.ref}' is not a full commit sha`;
  if (definition.kind === COUNTED_KIND && provenance.type === CONTROL_PROVENANCE_TYPE) return 'a failure case cannot carry control provenance';
  if (definition.kind !== COUNTED_KIND && provenance.type !== CONTROL_PROVENANCE_TYPE) return 'a control case must carry control provenance';
  return null;
}

export function casesWithoutProvenance(repository) {
  return replayCases(repository)
    .map(({ id, definition }) => ({ id, problem: definition === null ? 'case.json is missing or not JSON' : provenanceProblem(definition) }))
    .filter(({ problem }) => problem !== null);
}

export function realReplayCases(repository) {
  return replayCases(repository)
    .filter(({ definition }) => definition !== null && definition.kind === COUNTED_KIND && definition.ready !== false)
    .filter(({ definition }) => provenanceProblem(definition) === null)
    .map(({ id }) => id);
}

export function adhdFailureCases(repository) {
  const file = repository.join(ADHD_CASES_FILE);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((entry) => entry !== null && ADHD_FAILURE_SOURCES.includes(entry.source))
    .map((entry) => entry.id);
}

export function realFailureCount(repository) {
  return realReplayCases(repository).length + adhdFailureCases(repository).length;
}

export function checkEvalRealFailures(report, repository) {
  const missing = casesWithoutProvenance(repository);
  report.assert(
    missing.length === 0,
    NAME,
    'every replay case names its provenance',
    missing.map(({ id, problem }) => `NO-PROVENANCE ${REPLAY_CASES_FOLDER}/${id}: ${problem}; add a provenance object (type, ref) to case.json`).join('\n')
  );
  const count = realFailureCount(repository);
  report.assert(
    count >= MIN_REAL_FAILURES,
    NAME,
    `${count} real-failure tasks (replay ${realReplayCases(repository).length}, adhd ${adhdFailureCases(repository).length}), minimum ${MIN_REAL_FAILURES}`,
    `TOO-FEW-REAL-FAILURES ${count} of ${MIN_REAL_FAILURES}: scaffold more from fix commits with node benchmarks/replay/scaffold-case.mjs`
  );
}
