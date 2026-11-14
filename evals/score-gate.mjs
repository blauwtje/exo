#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ZERO_PASS_FACTOR = 9;

function mainRoot() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.dirname(common);
}

function runEval(jsonPath, outDir) {
  const args = [
    'plugin', 'eval', '--case', 'gate-*', '--scaffold', '--allow-tools', 'Bash', 'Edit', 'Write',
    '--concurrency', '8', '--judge-model', 'sonnet', '--ablation', 'none', '--keep-temp',
    '--json', jsonPath, '--output-dir', outDir, '--max-cost-usd', '10', '--no-publish', '--trust-plugin',
  ];
  const result = spawnSync('claude', args, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, EXO_ROOT: process.cwd() } });
  if (!fs.existsSync(jsonPath)) {
    process.stderr.write(`eval wrote no json, exit ${result.status}\n`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const runCost = (run) => (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0);

function perPass(runs) {
  const total = runs.reduce((sum, run) => sum + runCost(run), 0);
  const passes = runs.filter((run) => run.passed).length;
  return passes === 0 ? total * ZERO_PASS_FACTOR : total / passes;
}

function addSpent(root, usd) {
  const file = path.join(root, '.exo', 'improve', 'spent.txt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) || 0 : 0;
  const after = before + usd;
  fs.writeFileSync(file, `${after.toFixed(4)}\n`);
  return after;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-gate-'));
const result = runEval(path.join(tmp, 'result.json'), path.join(tmp, 'out'));
const allRuns = [];
for (const testCase of result.cases) {
  const runs = Object.values(testCase.arms?.with ?? {});
  allRuns.push(...runs);
  console.log(`ITEM ${testCase.name} ${perPass(runs).toFixed(4)}`);
}
const total = allRuns.reduce((sum, run) => sum + runCost(run), 0);
const passes = allRuns.filter((run) => run.passed).length;
const score = passes === 0 ? total * ZERO_PASS_FACTOR : total / passes;
console.log(`PASSES ${passes}/${allRuns.length} TOTAL ${total.toFixed(4)}`);
console.log(`SPENT ${addSpent(mainRoot(), result.costUsd ?? total).toFixed(4)}`);
console.log(`SCORE ${score.toFixed(4)}`);
