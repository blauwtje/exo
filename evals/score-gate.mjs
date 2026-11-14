#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_RUN_USD = 10;
const MIN_PASSES = 2;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function mainRoot() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.dirname(common);
}

function readNumber(file) {
  return fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) || 0 : 0;
}

function runEval({ jsonPath, outDir, caseGlob, maxCost }) {
  const args = [
    'plugin', 'eval', '--case', caseGlob, '--scaffold', '--allow-tools', 'Bash', 'Edit', 'Write',
    '--concurrency', '8', '--judge-model', 'sonnet', '--ablation', 'none', '--keep-temp',
    '--json', jsonPath, '--output-dir', outDir, '--max-cost-usd', String(maxCost), '--no-publish', '--trust-plugin',
  ];
  const result = spawnSync('claude', args, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, EXO_ROOT: process.cwd() } });
  if (!fs.existsSync(jsonPath)) {
    process.stderr.write(`eval wrote no json, exit ${result.status}\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const runCost = (run) => (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function recordSpent(dir, spent, cost) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'spent.txt'), `${(spent + cost).toFixed(4)}\n`);
  fs.writeFileSync(path.join(dir, 'last-run.txt'), `${cost.toFixed(4)}\n`);
}

function stopAtCap(dir, cap) {
  const spent = readNumber(path.join(dir, 'spent.txt'));
  if (spent + readNumber(path.join(dir, 'last-run.txt')) >= cap) {
    console.log(`STOP spend-cap ${spent.toFixed(4)}/${cap}`);
    process.exit(2);
  }
  return Math.min(MAX_RUN_USD, cap - spent);
}

const jsonFile = option('--json');
const capArg = option('--cap');
const improveDir = path.join(mainRoot(), '.exo', 'improve');
const cap = capArg === undefined ? undefined : Number(capArg);
const maxCost = cap === undefined || jsonFile ? MAX_RUN_USD : stopAtCap(improveDir, cap);

let result;
if (jsonFile) {
  result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-gate-'));
  const paths = { jsonPath: path.join(tmp, 'result.json'), outDir: path.join(tmp, 'out') };
  result = runEval({ ...paths, caseGlob: option('--case') ?? 'gate-*', maxCost });
  const total = result.cases.flatMap((testCase) => Object.values(testCase.arms?.with ?? {})).reduce((sum, run) => sum + runCost(run), 0);
  recordSpent(improveDir, readNumber(path.join(improveDir, 'spent.txt')), result.costUsd ?? total);
}

const caseRuns = result.cases.map((testCase) => ({ name: testCase.name, runs: Object.values(testCase.arms?.with ?? {}) }));
const allRuns = caseRuns.flatMap((testCase) => testCase.runs);
const passes = allRuns.filter((run) => run.passed).length;
const broken = allRuns.some((run) => run.error) || caseRuns.some((testCase) => testCase.runs.filter((run) => run.passed).length < MIN_PASSES);
if (broken) {
  console.log('GUARD fail');
  process.exit(1);
}
console.log(`GUARD ok ${passes}/${allRuns.length}`);
for (const testCase of caseRuns) {
  console.log(`TURNS ${testCase.name} ${Math.max(...testCase.runs.map((run) => run.turns ?? 0))}`);
}
const caseMeans = caseRuns.map((testCase) => mean(testCase.runs.filter((run) => run.passed).map(runCost)));
console.log(`SCORE ${mean(caseMeans).toFixed(4)}`);
