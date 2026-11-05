import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLASSES, FREE_SUITE_TIMEOUT_MS, MANIFEST_FILE, TIERS, freeRegressionSuites, readManifest, suitesOf } from '../../benchmarks/suites.mjs';
import { isScorer } from './benchmark-entry-points.mjs';
import { benchmarkScripts, EXEMPT_HELPERS, isPaidEntry, readScript } from './benchmark-entry-points.mjs';

const NAME = 'eval suites';
const RUN_NAME = 'eval suites free regression';
const SUITES_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'benchmarks', 'suites.mjs');

export const RUN_TIMEOUT_MS = 2 * FREE_SUITE_TIMEOUT_MS;
export const RUN_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

export function suiteFiles(repository) {
  return benchmarkScripts(repository)
    .filter((file) => EXEMPT_HELPERS[file] === undefined)
    .filter((file) => isScorer(file) || isPaidEntry(readScript(repository, file)));
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function suiteProblems(suite, ids) {
  const label = isText(suite.id) ? suite.id : '(no id)';
  const problems = [];
  if (!isText(suite.id)) problems.push('a suite has no id');
  if (ids.has(suite.id)) problems.push(`${label}: id is used twice`);
  if (!isText(suite.purpose)) problems.push(`${label}: no purpose`);
  if (!TIERS.includes(suite.tier)) problems.push(`${label}: tier must be one of ${TIERS.join(', ')}`);
  if (!CLASSES.includes(suite.class)) problems.push(`${label}: class must be one of ${CLASSES.join(', ')}`);
  if (!isText(suite.basis)) problems.push(`${label}: no basis for its class`);
  if (!Array.isArray(suite.entries)) problems.push(`${label}: entries must be a list`);
  const free = suite.tier === 'free' && suite.class === 'regression';
  const hasRun = Array.isArray(suite.run) && suite.run[0] === 'node' && suite.run.length > 1;
  if (free && !hasRun) problems.push(`${label}: a free regression suite needs run: ["node", ...args]`);
  if (!free && suite.run !== undefined) problems.push(`${label}: only a free regression suite carries run; paid suites stay manual`);
  ids.add(suite.id);
  return problems;
}

export function manifestProblems(repository, manifest) {
  const suites = suitesOf(manifest);
  const ids = new Set();
  const problems = suites.length === 0 ? [`${MANIFEST_FILE} lists no suite`] : suites.flatMap((suite) => suiteProblems(suite, ids));
  const owner = new Map();
  for (const suite of suites) {
    for (const file of Array.isArray(suite.entries) ? suite.entries : []) {
      if (owner.has(file)) problems.push(`${file}: listed in both ${owner.get(file)} and ${suite.id}`);
      owner.set(file, suite.id);
      if (!fs.existsSync(repository.join(file))) problems.push(`${suite.id}: entry ${file} does not exist`);
    }
  }
  const missing = suiteFiles(repository).filter((file) => !owner.has(file));
  return [...problems, ...missing.map((file) => `${file}: scorer or paid entry point in no suite of ${MANIFEST_FILE}`)];
}

function runFree(repository) {
  const run = spawnSync(process.execPath, [SUITES_SCRIPT, '--run', '--json', '--root', repository.join('.')], {
    encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: RUN_OUTPUT_LIMIT_BYTES
  });
  if (run.error) return { error: `runner did not finish: ${run.error.message}` };
  try {
    return { results: JSON.parse(run.stdout).results };
  } catch {
    return { error: `runner exit ${run.status} gave no result: ${(run.stderr || run.stdout).trim().split('\n').slice(-3).join(' | ')}` };
  }
}

function failureLines(results) {
  return results.filter((result) => !result.ok).map((result) => {
    const cause = result.timedOut ? 'timed out' : 'failed';
    return `FREE-SUITE ${result.id} ${cause}:\n${result.tail}`;
  });
}

export function checkEvalSuites(report, repository) {
  let manifest;
  try {
    manifest = readManifest(repository.join('.'));
  } catch (error) {
    report.assert(false, NAME, '', error.message);
    return;
  }
  const problems = manifestProblems(repository, manifest);
  const suites = suitesOf(manifest);
  report.assert(
    problems.length === 0,
    NAME,
    `${suites.length} suites tag every scorer and paid entry point with a purpose, class and tier`,
    problems.map((problem) => `NO-SUITE ${problem}`).join('\n')
  );
  const free = freeRegressionSuites(manifest);
  if (free.length === 0) return;
  const outcome = runFree(repository);
  const failures = outcome.error ? [`FREE-SUITE ${outcome.error}`] : failureLines(outcome.results);
  const seconds = outcome.error ? 0 : Math.max(...outcome.results.map((result) => result.ms)) / 1000;
  report.assert(
    failures.length === 0,
    RUN_NAME,
    `${free.length} free regression suites passed with no model call, slowest ${seconds.toFixed(1)} s`,
    failures.join('\n')
  );
}
