#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { usageCounts } from '#token-weights';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { makeRunFolder, withHome } from '../skills/edit-skills/scripts/pressure.mjs';
import { countsCost } from './pricing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'benchmarks/results/improve-vs-goal.json');
const SESSION_MS = environmentMs('EXO_IMPROVE_GOAL_MS', 20 * 60 * 1000);
const JUDGE_MS = environmentMs('EXO_IMPROVE_GOAL_JUDGE_MS', 60 * 1000);
const POLL_MS = 1000;
const QUICK_RUNS = 1;
const DEFAULT_CAP_USD = 1.5;
const WRONG = 999999999;
const USAGE = `usage: node benchmarks/improve-vs-goal.mjs [--dry-run] [--runs <n>] [--cap <usd>] [--arm improve|goal] [--out <file>]
Runs exo:improve and Claude Code /goal on one throwaway sort fixture, both on sonnet, each capped by --max-budget-usd.
Default is the quick tier: ${QUICK_RUNS} run per arm, cap $${DEFAULT_CAP_USD}. --dry-run prints the session count and the most it can spend, then exits.
Quality: the frozen scorer's comparison count (lower is better) and a held-out judge on other seeds and sizes, run on the final tree.`;

const GOAL = 'Lower the comparisons= count that node score.mjs prints; sort.mjs must keep sorting correctly, using only the compare function it is given';
const PROMPTS = {
  improve: `/exo:improve ${GOAL}`,
  goal: `/goal ${GOAL}; score.mjs stays unchanged; or stop after 10 turns`
};

const BUBBLE_SORT = `export function sort(items, compare) {
  const result = items.slice();
  for (let end = result.length - 1; end > 0; end -= 1) {
    for (let index = 0; index < end; index += 1) {
      if (compare(result[index], result[index + 1]) > 0) [result[index], result[index + 1]] = [result[index + 1], result[index]];
    }
  }
  return result;
}
`;

const FROZEN_CASES = { seed: 1, cases: Array.from({ length: 20 }, () => [200, false]) };
const HELD_OUT_CASES = { seed: 99, cases: [0, 1, 2, 3, 10, 57, 200, 300].flatMap((size) => [[size, false], [size, true]]) };

export function scorerSource({ seed, cases }) {
  return `import { sort } from './sort.mjs';

const SEED = ${seed};
const CASES = ${JSON.stringify(cases)};
const WRONG = ${WRONG};

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function keysFor(size, duplicates, next) {
  const keys = Array.from({ length: size }, (_, index) => (duplicates ? Math.floor(next() * Math.max(1, size / 4)) : index));
  for (let index = size - 1; index > 0; index -= 1) {
    const pick = Math.floor(next() * (index + 1));
    [keys[index], keys[pick]] = [keys[pick], keys[index]];
  }
  return keys;
}

function comparisonsFor(keys) {
  const hidden = new WeakMap();
  const items = keys.map((key) => {
    const item = Object.freeze({});
    hidden.set(item, key);
    return item;
  });
  let count = 0;
  const compare = (a, b) => {
    count += 1;
    return Math.sign(hidden.get(a) - hidden.get(b));
  };
  const output = sort(items.slice(), compare);
  if (!Array.isArray(output) || output.length !== keys.length) return null;
  const expected = keys.slice().sort((a, b) => a - b);
  return output.every((item, index) => hidden.get(item) === expected[index]) ? count : null;
}

const next = random(SEED);
let total = 0;
let correct = true;
for (const [size, duplicates] of CASES) {
  const count = comparisonsFor(keysFor(size, duplicates, next));
  if (count === null) correct = false;
  else total += count;
}
console.log(\`correct=\${correct ? 'yes' : 'no'}\`);
console.log(\`comparisons=\${correct ? total : WRONG}\`);
`;
}

const FIXTURE = {
  'sort.mjs': BUBBLE_SORT,
  'score.mjs': scorerSource(FROZEN_CASES),
  'package.json': `${JSON.stringify({ name: 'sort-fixture', private: true, type: 'module', scripts: { score: 'node score.mjs' } }, null, 2)}\n`,
  '.gitignore': '.worktrees/\n.exo/\n'
};

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function writeFixture(scratch) {
  for (const [name, text] of Object.entries(FIXTURE)) fs.writeFileSync(path.join(scratch, name), text);
  git(scratch, ['add', '.']);
  git(scratch, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'chore: add the sort fixture']);
}

export function judge(sortText, cases) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-vs-goal-judge-'));
  try {
    fs.writeFileSync(path.join(folder, 'package.json'), '{"type":"module"}\n');
    fs.writeFileSync(path.join(folder, 'sort.mjs'), sortText);
    fs.writeFileSync(path.join(folder, 'judge.mjs'), scorerSource(cases));
    const run = spawnSync(process.execPath, ['judge.mjs'], { cwd: folder, encoding: 'utf8', timeout: JUDGE_MS });
    const match = /^comparisons=(\d+)$/m.exec(run.stdout ?? '');
    return match === null ? WRONG : Number(match[1]);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

export function improveTip(scratch) {
  const refs = git(scratch, ['for-each-ref', '--format=%(refname)', 'refs/heads/improve/']).stdout.split('\n').filter(Boolean);
  return refs[0] ?? null;
}

function finalTree(arm, scratch) {
  const fromRef = (ref, file) => git(scratch, ['show', `${ref}:${file}`]).stdout;
  const fromDisk = (file) => fs.readFileSync(path.join(scratch, file), 'utf8');
  if (arm !== 'improve') return { ref: 'working tree', sortText: fromDisk('sort.mjs'), scoreText: fromDisk('score.mjs') };
  const ref = improveTip(scratch);
  if (ref === null) return { ref: 'HEAD (no improve branch)', sortText: fromRef('HEAD', 'sort.mjs'), scoreText: fromRef('HEAD', 'score.mjs') };
  return { ref, sortText: fromRef(ref, 'sort.mjs'), scoreText: fromRef(ref, 'score.mjs') };
}

export function quality(tree) {
  const score = judge(tree.sortText, FROZEN_CASES);
  const heldOut = judge(tree.sortText, HELD_OUT_CASES);
  return { score, heldOut, correct: score !== WRONG && heldOut !== WRONG, scorerUnchanged: sha256(tree.scoreText) === sha256(FIXTURE['score.mjs']) };
}

export function streamCost(lines) {
  const seen = new Map();
  let result = null;
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'result') result = event;
    const message = event.type === 'assistant' ? event.message : undefined;
    if (message?.usage !== undefined && message.id !== undefined) seen.set(message.id, countsCost(usageCounts(message.usage), message.model) ?? 0);
  }
  if (result?.total_cost_usd !== undefined) return { costUsd: result.total_cost_usd, costSource: 'result', result };
  return { costUsd: [...seen.values()].reduce((sum, cost) => sum + cost, 0), costSource: 'usage sum', result };
}

function sessionArgs(arm, cap) {
  const args = ['-p', PROMPTS[arm], '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--max-budget-usd', String(cap)];
  return arm === 'improve' ? [...args, '--plugin-dir', ROOT] : args;
}

export function spawnSession({ run, env, logFile, wallMs }) {
  const log = fs.createWriteStream(logFile);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    let text = '';
    let rounds = 0;
    let killed = false;
    child.stdout.on('data', (chunk) => { text += chunk; log.write(chunk); });
    const timer = setInterval(() => {
      rounds += 1;
      if (rounds * POLL_MS < wallMs) return;
      killed = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, POLL_MS);
    child.on('close', () => {
      clearInterval(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      log.end();
      resolve({ text, killed, wallS: Math.round((Date.now() - started) / 1000) });
    });
  });
}

async function runSession({ arm, cap, home }) {
  const { scratch, tmp, roots } = makeRunFolder(`ivg-${arm}`);
  writeFixture(scratch);
  const run = withHome(confinedClaude({ args: sessionArgs(arm, cap), roots, cwd: scratch, tmp }), home);
  const logFile = path.join(os.tmpdir(), `improve-vs-goal-${arm}-${Date.now()}.jsonl`);
  const { text, killed, wallS } = await spawnSession({ run, env: { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' }, logFile, wallMs: SESSION_MS });
  const { costUsd, costSource, result } = streamCost(text.split('\n'));
  const tree = finalTree(arm, scratch);
  const record = {
    arm, costUsd: Number(costUsd.toFixed(4)), costSource, wallS, killed,
    subtype: result?.subtype ?? null, numTurns: result?.num_turns ?? null,
    models: Object.keys(result?.modelUsage ?? {}), finalRef: tree.ref, ...quality(tree), log: logFile
  };
  fs.rmSync(path.dirname(scratch), { recursive: true, force: true });
  return record;
}

function parseOptions(argv) {
  const flags = parseFlags(argv, { 'dry-run': 'boolean', runs: 'string', cap: 'string', arm: 'string', out: 'string' }, { usage: USAGE });
  const runs = Number(flags.runs ?? QUICK_RUNS);
  const cap = Number(flags.cap ?? DEFAULT_CAP_USD);
  if (!Number.isInteger(runs) || runs < 1) throw new UsageError('--runs needs a whole number of at least 1');
  if (!(cap > 0)) throw new UsageError('--cap needs a dollar amount above 0');
  if (flags.arm !== undefined && !(flags.arm in PROMPTS)) throw new UsageError('--arm takes improve or goal');
  return { dryRun: flags['dry-run'] === true, runs, cap, arms: flags.arm === undefined ? Object.keys(PROMPTS) : [flags.arm], out: flags.out ?? OUT };
}

async function main(argv) {
  const options = parseOptions(argv);
  const sessions = options.arms.length * options.runs;
  const tier = options.runs === QUICK_RUNS ? 'quick' : 'full';
  if (options.dryRun) {
    console.log(`dry-run: ${tier} tier, ${sessions} sessions (${options.arms.join(', ')} x ${options.runs}), cap $${options.cap} each = at most $${(sessions * options.cap).toFixed(2)}, wall at most ${SESSION_MS / 60000} min each`);
    return;
  }
  const refusal = confineRefusal();
  if (refusal !== undefined) throw new Error(refusal);
  const home = makeDefaultOptionsHome({ withoutClaudeMd: true, withoutInstalledPlugins: true });
  try {
    const jobs = options.arms.flatMap((arm) => Array.from({ length: options.runs }, () => runSession({ arm, cap: options.cap, home })));
    const runs = await Promise.all(jobs);
    const baseline = quality({ sortText: BUBBLE_SORT, scoreText: FIXTURE['score.mjs'] });
    const record = { date: new Date().toISOString().slice(0, 10), tier, model: 'sonnet', capUsd: options.cap, goal: GOAL, prompts: PROMPTS, baseline, runs };
    fs.writeFileSync(options.out, `${JSON.stringify(record, null, 2)}\n`);
    for (const run of runs) console.log(`${run.arm}: $${run.costUsd} (${run.costSource}), ${run.wallS} s, score ${run.score}, held-out ${run.heldOut}, correct ${run.correct}, scorer unchanged ${run.scorerUnchanged}, ${run.subtype}`);
    console.log(`baseline: score ${baseline.score}, held-out ${baseline.heldOut}; wrote ${path.relative(ROOT, options.out)}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? `${error.message}\n${USAGE}` : error.message);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
