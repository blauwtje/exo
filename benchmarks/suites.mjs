#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evalDefaults } from '../lib/eval-stats.mjs';
import { UsageError, environmentMs, isMain, parseFlags } from '#script-flags';
import { readJson } from './basics.mjs';

export const MANIFEST_FILE = 'benchmarks/suites.json';
export const CLASSES = ['capability', 'regression'];
export const TIERS = ['free', 'paid'];
export const MIN_GRADUATION_RUNS = evalDefaults().graduationRuns;
export const FREE_SUITE_CONCURRENCY = 4;
export const FREE_SUITE_TIMEOUT_MS = environmentMs('EXO_SUITE_TIMEOUT_MS', 60_000);
export const OUTPUT_TAIL_LINES = 12;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `usage: suites.mjs [--list] [--run] [--graduate] [--min-runs <n>] [--root <dir>] [--json]
--list       print every suite with its class, tier and entry files.
--run        run every free regression suite (zero model calls) ${FREE_SUITE_CONCURRENCY} at a time, each capped at EXO_SUITE_TIMEOUT_MS (default ${FREE_SUITE_TIMEOUT_MS} ms).
--graduate   from the recorded results a suite names, list the capability cases that passed in every recorded run
             once there are at least --min-runs of them (default ${MIN_GRADUATION_RUNS}: with no failure in n runs the failure rate stays under 3/n, 15% at 20);
             a regression suite prints its saturation as the proof it already graduated.
--root       repository root holding ${MANIFEST_FILE} (default: this checkout).
--json       print the result as JSON.
Exit codes: 0 all chosen work passed, 1 a free regression suite failed, 2 bad flag or manifest.`;

export function readManifest(root = ROOT) {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) throw new UsageError(`${MANIFEST_FILE} is missing under ${root}; add the suite manifest`);
  try {
    return readJson(file);
  } catch (error) {
    throw new UsageError(`${MANIFEST_FILE} is not valid JSON: ${error.message}`);
  }
}

export const suitesOf = (manifest) => (Array.isArray(manifest.suites) ? manifest.suites : []);

export const freeRegressionSuites = (manifest) =>
  suitesOf(manifest).filter((suite) => suite.tier === 'free' && suite.class === 'regression');

function tailOf(text) {
  return text.split('\n').filter(Boolean).slice(-OUTPUT_TAIL_LINES).join('\n');
}

function runSuite(root, suite, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const [, ...args] = suite.run;
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const collect = (chunk) => {
      output = (output + chunk).slice(-OUTPUT_TAIL_LINES * 400);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const finish = (ok, tail) => {
      clearTimeout(timer);
      resolve({ id: suite.id, ok, timedOut, ms: Date.now() - started, tail });
    };
    child.on('error', (error) => finish(false, error.message));
    child.on('close', (code) => finish(code === 0 && !timedOut, tailOf(output)));
  });
}

export async function runFreeSuites(root, suites, { concurrency = FREE_SUITE_CONCURRENCY, timeoutMs = FREE_SUITE_TIMEOUT_MS } = {}) {
  const results = new Array(suites.length);
  let next = 0;
  async function worker() {
    while (next < suites.length) {
      const index = next;
      next += 1;
      results[index] = await runSuite(root, suites[index], timeoutMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, suites.length) }, worker));
  return results;
}

export function graduationCandidates(records, { minRuns = MIN_GRADUATION_RUNS } = {}) {
  const byCase = new Map();
  for (const record of records) {
    const tally = byCase.get(record.case) ?? { runs: 0, passes: 0 };
    tally.runs += 1;
    tally.passes += record.pass === true ? 1 : 0;
    byCase.set(record.case, tally);
  }
  return [...byCase]
    .filter(([, tally]) => tally.runs >= minRuns && tally.passes === tally.runs)
    .map(([name, tally]) => ({ case: name, runs: tally.runs }))
    .sort((left, right) => left.case.localeCompare(right.case));
}

export function readRecords(root, recorded) {
  const file = path.join(root, recorded.file);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .map((row) => ({ case: row[recorded.caseKey], pass: row[recorded.passKey] }))
    .filter((record) => record.case !== undefined && typeof record.pass === 'boolean');
}

export function graduationReport(root, manifest, { minRuns = MIN_GRADUATION_RUNS } = {}) {
  return suitesOf(manifest).filter((suite) => suite.recorded !== undefined).map((suite) => {
    const records = readRecords(root, suite.recorded);
    const cases = new Set(records.map((record) => record.case));
    const saturated = graduationCandidates(records, { minRuns });
    return {
      suite: suite.id,
      class: suite.class,
      records: records.length,
      cases: cases.size,
      saturated,
      graduate: suite.class === 'capability' ? saturated : []
    };
  });
}

function graduationLines(report, minRuns) {
  if (report.length === 0) return ['no suite names recorded results'];
  return report.map((entry) => {
    if (entry.class === 'regression') {
      return `${entry.suite}: regression; ${entry.saturated.length} of ${entry.cases} cases passed every one of at least ${minRuns} recorded runs (${entry.records} records), nothing to graduate`;
    }
    const names = entry.graduate.map((candidate) => `${candidate.case} (${candidate.runs} runs)`).join(', ');
    return `${entry.suite}: capability; ${entry.graduate.length === 0 ? 'no candidate' : `graduate to regression: ${names}`}`;
  });
}

function listLines(manifest) {
  return suitesOf(manifest).map((suite) => `${suite.id}\t${suite.class}\t${suite.tier}\t${(suite.entries ?? []).join(' ')}`);
}

function runLines(results) {
  return results.map((result) => `${result.ok ? 'PASS' : 'FAIL'} ${result.id} ${(result.ms / 1000).toFixed(1)} s${result.ok ? '' : `\n${result.tail}`}`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2), {
    list: 'boolean', run: 'boolean', graduate: 'boolean', json: 'boolean', root: 'value', 'min-runs': 'value'
  }, { usage: USAGE });
  if (!flags.list && !flags.run && !flags.graduate) throw new UsageError('choose --list, --run or --graduate');
  const minRuns = flags['min-runs'] === undefined ? MIN_GRADUATION_RUNS : Number(flags['min-runs']);
  if (!Number.isInteger(minRuns) || minRuns < 1) throw new UsageError('--min-runs must be a positive integer');
  const root = path.resolve(flags.root ?? ROOT);
  const manifest = readManifest(root);
  const output = {};
  const lines = [];
  if (flags.list) {
    output.suites = suitesOf(manifest);
    lines.push(...listLines(manifest));
  }
  if (flags.graduate) {
    output.graduation = graduationReport(root, manifest, { minRuns });
    lines.push(...graduationLines(output.graduation, minRuns));
  }
  if (flags.run) {
    output.results = await runFreeSuites(root, freeRegressionSuites(manifest));
    lines.push(...runLines(output.results));
  }
  process.stdout.write(`${flags.json ? JSON.stringify(output) : lines.join('\n')}\n`);
  if ((output.results ?? []).some((result) => !result.ok)) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
