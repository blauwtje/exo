// Run one `claude plugin eval` case per arm, split across runner processes so
// more runs are in flight than the runner's own --concurrency cap of 8 allows,
// then merge the processes into one aggregate-result.json and hand it to
// eval-reasons.mjs, which prints each grader's pass rate per arm and asks a
// reasoning judge about every failed vote.
//
//   node eval-case.mjs --case <name> [--mode full|draft] [--arm no-plugin|plugin|both]
//                      [--concurrency <runs in flight>]
//
// --concurrency defaults to every run of every arm at once: 20 runs in flight
// finished without an errored run on one subscription, and a case never has
// more runs than that to spread.
// full   the case's own `runs:` per arm, the verdict.
// draft  3 runs, no-plugin arm, for iterating on wording; never a verdict.
//
// The no-plugin arm runs from a scratch directory that holds only the case, so
// no plugin resolves: that is the runner's own no-plugin arm, a case with no
// plugin directory. The plugin arm runs from the repository with --ablation none.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';

const ROOT = import.meta.dirname;
const RUNNER_CONCURRENCY_CAP = 8;
const JUDGE_MODEL = 'sonnet';
const DRAFT_RUNS = 3;
const ARMS_BY_CHOICE = { 'no-plugin': ['no-plugin'], plugin: ['plugin'], both: ['no-plugin', 'plugin'] };

function fail(message) {
  console.error(message);
  process.exit(1);
}

function caseRuns(caseDirectory) {
  const prompt = fs.readFileSync(path.join(caseDirectory, 'prompt.md'), 'utf8');
  const delimited = prompt.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const runs = delimited ? parseDocument(delimited[1]).toJS()?.runs : undefined;
  return Number.isInteger(runs) ? runs : 3;
}

// Split an arm's runs over as few runner processes as keep `inFlight` runs going.
function shardSizes(runs, inFlight) {
  const processes = Math.ceil(Math.min(runs, inFlight) / RUNNER_CONCURRENCY_CAP);
  const base = Math.floor(runs / processes);
  return Array.from({ length: processes }, (_, index) => base + (index < runs % processes ? 1 : 0));
}

function stageNoPluginTarget(caseName) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-eval-no-plugin-'));
  fs.cpSync(path.join(ROOT, 'evals', caseName), path.join(scratch, 'evals', caseName), { recursive: true });
  return scratch;
}

function runShard({ label, target, caseName, runs, concurrency, outputDirectory, pluginArm }) {
  const args = [
    'plugin', 'eval', target, '--case', caseName, '--runs', String(runs),
    '--concurrency', String(concurrency), '--judge-model', JUDGE_MODEL, '--threshold', '0',
    '--output-dir', outputDirectory, '--no-publish', '--trust-plugin'
  ];
  if (pluginArm) args.push('--ablation', 'none');
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const prefix = (chunk) => String(chunk).split('\n').filter((line) => line.trim()).map((line) => `[${label}] ${line}`).join('\n');
    child.stdout.on('data', (chunk) => console.log(prefix(chunk)));
    child.stderr.on('data', (chunk) => console.error(prefix(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${label}: claude plugin eval exited ${code}`));
      else resolve();
    });
  });
}

// The runner exits 0 when --case matches nothing, so an empty or foreign case list is a failure here.
function readShard(outputDirectory, caseName, label) {
  const file = path.join(outputDirectory, 'aggregate-result.json');
  if (!fs.existsSync(file)) fail(`${label}: no aggregate-result.json in ${outputDirectory}`);
  const aggregate = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = aggregate.cases.map((evalCase) => evalCase.name);
  if (names.length !== 1 || names[0] !== caseName) fail(`${label}: expected case count 1 (${caseName}), got ${names.length}: ${names.join(', ')}`);
  return aggregate;
}

function runChild(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(script)} exited ${code}`))));
  });
}

const { values: options } = parseArgs({
  options: {
    case: { type: 'string' },
    mode: { type: 'string', default: 'full' },
    arm: { type: 'string' },
    concurrency: { type: 'string' }
  }
});

const caseName = options.case;
if (caseName === undefined) fail('--case <name> is required');
const caseDirectory = path.join(ROOT, 'evals', caseName);
if (!fs.existsSync(path.join(caseDirectory, 'prompt.md'))) fail(`evals/${caseName}/prompt.md does not exist`);
if (!['full', 'draft'].includes(options.mode)) fail('--mode must be full or draft');
const armChoice = options.arm ?? 'no-plugin';
const arms = ARMS_BY_CHOICE[armChoice];
if (arms === undefined) fail('--arm must be no-plugin, plugin or both');
const draft = options.mode === 'draft';
const runsPerArm = draft ? DRAFT_RUNS : caseRuns(caseDirectory);
const concurrency = options.concurrency === undefined ? runsPerArm * arms.length : Number(options.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1) fail('--concurrency must be a whole number of at least 1');
const stamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-');
const runDirectory = path.join(ROOT, 'evals', 'results', `${stamp}-${options.mode}-${armChoice}`);
fs.mkdirSync(runDirectory, { recursive: true });

const inFlightPerArm = Math.max(1, Math.floor(concurrency / arms.length));
const scratchTargets = [];
const shards = [];
for (const arm of arms) {
  const target = arm === 'no-plugin' ? stageNoPluginTarget(caseName) : ROOT;
  if (target !== ROOT) scratchTargets.push(target);
  const sizes = shardSizes(runsPerArm, inFlightPerArm);
  const inFlightPerShard = Math.ceil(inFlightPerArm / sizes.length);
  sizes.forEach((runs, index) => {
    const label = `${arm}-${index + 1}`;
    const concurrencyForShard = Math.min(runs, RUNNER_CONCURRENCY_CAP, inFlightPerShard);
    shards.push({ arm, label, target, caseName, runs, concurrency: concurrencyForShard, outputDirectory: path.join(runDirectory, label), pluginArm: arm === 'plugin' });
  });
}

console.log(`${options.mode} run of ${caseName}: ${runsPerArm} runs per arm (${arms.join(', ')}), judge ${JUDGE_MODEL}, ${shards.map((shard) => `${shard.label} ${shard.runs}x${shard.concurrency}`).join(', ')}`);
if (draft) console.log('DRAFT: not authoritative. Use it to iterate on wording; take a verdict from the full run.');

const startedAt = Date.now();
try {
  await Promise.all(shards.map(runShard));
} finally {
  for (const scratch of scratchTargets) fs.rmSync(scratch, { recursive: true, force: true });
}
const evalSeconds = Math.round((Date.now() - startedAt) / 1000);

const armRuns = Object.fromEntries(arms.map((arm) => [arm, []]));
let graders;
let costUsd = 0;
for (const shard of shards) {
  const aggregate = readShard(shard.outputDirectory, caseName, shard.label);
  const [evalCase] = aggregate.cases;
  const runnerArms = Object.keys(evalCase.arms);
  if (runnerArms.length !== 1) fail(`${shard.label}: expected one runner arm, got ${runnerArms.join(', ')}`);
  const pluginCount = aggregate.suite?.plugins?.length ?? 0;
  if ((shard.arm === 'no-plugin') !== (pluginCount === 0)) fail(`${shard.label}: ${pluginCount} plugin(s) loaded, which does not match the ${shard.arm} arm`);
  const runs = evalCase.arms[runnerArms[0]];
  armRuns[shard.arm].push(...runs);
  graders = evalCase.graders;
  costUsd += runs.reduce((sum, run) => sum + run.costUsd + run.judgeCostUsd, 0);
}

const merged = {
  suite: { caseFilter: caseName, judgeModel: JUDGE_MODEL, mode: options.mode, authoritative: !draft, concurrency },
  durationSeconds: evalSeconds,
  costUsd,
  cases: [{ name: caseName, graders, arms: armRuns }]
};
fs.writeFileSync(path.join(runDirectory, 'aggregate-result.json'), `${JSON.stringify(merged, null, 2)}\n`);

await runChild(path.join(ROOT, 'eval-reasons.mjs'), [runDirectory]);
const reasons = JSON.parse(fs.readFileSync(path.join(runDirectory, 'judge-reasons.json'), 'utf8'));
const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
const totalCost = costUsd + reasons.costUsd;
console.log(`wall time ${totalSeconds}s (eval ${evalSeconds}s), cost $${totalCost.toFixed(2)} (runs and judges $${costUsd.toFixed(2)}, reasons $${reasons.costUsd.toFixed(2)})`);
if (draft) console.log('DRAFT: not authoritative.');
console.log(`results in ${path.relative(ROOT, runDirectory)}`);
