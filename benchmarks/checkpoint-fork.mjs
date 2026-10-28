#!/usr/bin/env node
// benchmarks/checkpoint-fork.mjs
// Starts a verify-only session from the state a full flow-unit cell had just
// before its lead first loaded exo:verify, and compares what that session
// spends with what the full cell spent from the same point on. The full cells
// come from `sweep.mjs --keep-repo`, which keeps each cell repository, its
// origin and (with preserved timestamps) its .exo/ files.
//
//   node benchmarks/checkpoint-fork.mjs --checkpoints <keep> --full-runs <sweep out> --out <dir>
//       prints the forks planned for the quick tier (1 fork per kept cell), starts none
//   ... --full   plans 2 forks per kept cell; --forks <n> overrides either tier
//   ... --dry-run   prints the plan and the cost cap, spends nothing, exits 0
//   ... --confirm [--max-usd 6]   runs them, stopping before a fork that would pass the cap
//   node benchmarks/checkpoint-fork.mjs --analyse --full-runs <sweep out> --out <dir>
//       prints the comparison of the full cells with the forks recorded under --out
//
// A fork is billed, so none starts without --confirm.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { sumCounts, usageCounts } from '#token-weights';
import { writeCellUsage } from './cell-usage.mjs';
import { checkFlow } from './flow-check.mjs';
import { readJsonl } from './lean-gates-metrics.mjs';
import { countsCost } from './pricing.mjs';
import { NO_ANSWER, sweepCells } from './sweep-cells.mjs';
import { FLOW_BRANCH, FLOW_PLAN } from './sweep-fixtures.mjs';
import { reviewStages } from './sweep-score.mjs';
import { runClaude } from './sweep.mjs';
import { mannWhitney, meanAndSd } from './statistics.mjs';

const VERIFY_SKILL = /(^|:)verify$/;
const MINUTE_MS = 60 * 1000;
const FORK_BUDGET_USD = 1;
const FORK_TIMEOUT_MS = 30 * MINUTE_MS;
const DEFAULT_MAX_USD = 6;
const QUICK_FORKS = 1;
const FULL_FORKS = 2;
const FORK_CELL = 'flow-unit';

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function timeOf(entry) {
  const ms = Date.parse(entry?.timestamp ?? '');
  return Number.isNaN(ms) ? null : ms;
}

// When the lead of this transcript first called the verify skill, in epoch
// milliseconds, or null when it never did.
export function verifyPoint(transcriptFile) {
  for (const entry of readJsonl(transcriptFile)) {
    const content = entry?.message?.content;
    if (entry?.type !== 'assistant' || !Array.isArray(content)) continue;
    const call = content.find((part) => part?.type === 'tool_use' && part.name === 'Skill' && VERIFY_SKILL.test(part.input?.skill ?? ''));
    if (call) return timeOf(entry);
  }
  return null;
}

// The API calls of one transcript file whose message first appeared at or
// after `fromMs`: one response is several lines sharing a message id and the
// last line carries the final counts, so the first line gives the time.
function callsFrom(file, fromMs) {
  const calls = new Map();
  let first = null;
  let last = null;
  for (const entry of readJsonl(file)) {
    const ms = timeOf(entry);
    if (ms !== null) {
      first = first === null ? ms : Math.min(first, ms);
      last = last === null ? ms : Math.max(last, ms);
    }
    const message = entry?.message;
    if (entry?.type !== 'assistant' || !message?.id || !message.usage) continue;
    const seen = calls.get(message.id);
    calls.set(message.id, { at: seen?.at ?? ms, counts: usageCounts(message.usage), model: message.model });
  }
  return { first, last, calls: [...calls.values()].filter((call) => fromMs === null || (call.at ?? 0) >= fromMs) };
}

function subagentFiles(mainFile) {
  const directory = path.join(mainFile.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl')).sort().map((name) => path.join(directory, name));
}

function agentType(file) {
  try {
    return JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// What a session spent from its verify call on, priced at list price: the lead's
// calls from the message that loaded exo:verify, plus every subagent that
// started at or after it. A transcript with no verify call counts whole
// (`atMs` null). The same function reads a full cell and a fork, so the two
// blocks cover the same work. `costUsd` is null when a model has no price.
export function verifyBlock(transcriptFile) {
  const atMs = verifyPoint(transcriptFile);
  const lead = callsFrom(transcriptFile, atMs);
  const calls = [...lead.calls];
  const subagents = [];
  let end = lead.last;
  for (const file of subagentFiles(transcriptFile)) {
    const part = callsFrom(file, null);
    if (atMs !== null && (part.first === null || part.first < atMs)) continue;
    calls.push(...part.calls);
    subagents.push(agentType(file));
    if (part.last !== null) end = Math.max(end ?? 0, part.last);
  }
  const prices = calls.map((call) => countsCost(call.counts, call.model));
  const total = sumCounts(calls.map((call) => call.counts));
  return {
    atMs,
    costUsd: prices.some((price) => price === null) ? null : prices.reduce((sum, price) => sum + price, 0),
    tokens: Math.round(total.weightedInput + total.output),
    wallMs: atMs !== null && end !== null ? end - atMs : null,
    subagents,
    fixLoop: reviewStages(subagents, '').fixReview > 0
  };
}

function exoFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? exoFiles(path.join(directory, entry.name), relative) : [relative];
  });
}

function removeEmptyDirectories(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name));
  }
  if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}

// Copies a kept cell into `forkRoot` (repo and origin.git, timestamps kept) and
// winds the repository back to just before `atMs`: origin points at the copy,
// stale worktree entries go, the plan branch resets to its last commit made at
// or before that second, untracked files go (not ignored ones: `.exo/` stays),
// and every .exo/ file modified after `atMs` is deleted. `changed` lists the
// deleted files `seenBefore(relative path)` says the session knew before `atMs`,
// since those held other content then and the fork does not get it back.
export function prepareCheckpoint(kept, forkRoot, atMs, { seenBefore = () => false } = {}) {
  fs.mkdirSync(forkRoot, { recursive: true });
  for (const entry of ['repo', 'origin.git']) {
    const source = path.join(kept, entry);
    const target = path.join(forkRoot, entry);
    fs.rmSync(target, { recursive: true, force: true });
    if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  }
  const repository = path.join(forkRoot, 'repo');
  const origin = path.join(forkRoot, 'origin.git');
  if (fs.existsSync(origin)) git(repository, ['remote', 'set-url', 'origin', origin]);
  git(repository, ['worktree', 'prune']);
  git(repository, ['checkout', '--force', FLOW_BRANCH]);
  const sha = git(repository, ['rev-list', '-1', `--before=${Math.floor(atMs / 1000)}`, FLOW_BRANCH]);
  if (sha === '') throw new Error(`${FLOW_BRANCH} has no commit before the verify call`);
  git(repository, ['reset', '--hard', sha]);
  git(repository, ['clean', '-fd']);
  const exo = path.join(repository, '.exo');
  const removed = [];
  for (const relative of exoFiles(exo)) {
    if (fs.statSync(path.join(exo, relative)).mtimeMs > atMs) {
      fs.rmSync(path.join(exo, relative));
      removed.push(relative.split(path.sep).join('/'));
    }
  }
  removeEmptyDirectories(exo);
  fs.mkdirSync(exo, { recursive: true });
  return { repository, sha, removed, changed: removed.filter((relative) => seenBefore(`.exo/${relative}`)) };
}

// The transcript text up to the verify call, so a deleted file whose path
// appears there is reported as one the session already knew.
function transcriptBefore(transcriptFile, atMs) {
  return readJsonl(transcriptFile).filter((entry) => (timeOf(entry) ?? 0) < atMs).map((entry) => JSON.stringify(entry)).join('\n');
}

export function forkPrompt() {
  return `Load the exo:verify skill and run it on the plan ${FLOW_PLAN}, branch ${FLOW_BRANCH}, base main. Push nothing and open no pull request.\n${NO_ANSWER}`;
}

function forkCell() {
  const cell = sweepCells().find((candidate) => candidate.id === FORK_CELL);
  return { ...cell, id: `${FORK_CELL}-fork`, prompt: forkPrompt(), budgetUsd: String(FORK_BUDGET_USD), timeoutMs: FORK_TIMEOUT_MS };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// One verify-only session started from the checkpoint of kept cell `name`,
// recorded as <forkDirectory>/record.json the way sweep.mjs records a cell.
// `run` is runClaude, replaceable in the tests.
export async function runFork({ name, kept, fullTranscript, forkDirectory, run = runClaude }) {
  const atMs = verifyPoint(fullTranscript);
  if (atMs === null) throw new Error(`${name}: the full cell never called the verify skill`);
  fs.mkdirSync(forkDirectory, { recursive: true });
  const forkRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `exo-fork-${name}-`)));
  try {
    const before = transcriptBefore(fullTranscript, atMs);
    const checkpoint = prepareCheckpoint(kept, forkRoot, atMs, { seenBefore: (relative) => before.includes(relative) });
    const cell = forkCell();
    const outcome = await run(cell, checkpoint.repository, forkRoot, forkDirectory, {});
    const result = readJson(path.join(forkDirectory, 'stdout.json'));
    const usage = typeof result?.session_id === 'string' ? writeCellUsage(forkDirectory, result.session_id) : null;
    const block = usage?.transcript ? verifyBlock(usage.transcript) : null;
    let check;
    try {
      check = await checkFlow(checkpoint.repository);
    } catch (error) {
      check = { pass: false, defects: [`flow check failed: ${error.message}`] };
    }
    const record = {
      id: cell.id,
      from: name,
      checkpointSha: checkpoint.sha,
      verifyAtMs: atMs,
      removedExoFiles: checkpoint.removed,
      changedExoFiles: checkpoint.changed,
      model: cell.model,
      effort: cell.effort,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      wallMs: outcome.wallMs,
      costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
      tokens: usage?.counts == null ? null : Math.round(usage.counts.weightedInput + usage.counts.output),
      verifyCostUsd: block?.costUsd ?? null,
      verifyTokens: block?.tokens ?? null,
      verifyWallMs: block?.wallMs ?? null,
      subagents: usage?.subagents ?? null,
      fixLoop: block?.fixLoop ?? null,
      hiddenPass: check.pass,
      defects: check.defects
    };
    fs.writeFileSync(path.join(forkDirectory, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } finally {
    fs.rmSync(forkRoot, { recursive: true, force: true });
  }
}

function fullCells(fullRuns) {
  if (!fs.existsSync(fullRuns)) return [];
  return fs.readdirSync(fullRuns, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().flatMap((name) => {
    const usage = readJson(path.join(fullRuns, name, 'usage.json'));
    const record = readJson(path.join(fullRuns, name, 'record.json'));
    return usage?.transcript && record !== null && fs.existsSync(usage.transcript) ? [{ name, transcript: usage.transcript, record }] : [];
  });
}

function forkRecords(out) {
  if (!fs.existsSync(out)) return [];
  return fs.readdirSync(out, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readJson(path.join(out, entry.name, 'record.json'))).filter((record) => record !== null);
}

const rate = (values) => values.length === 0 ? '-' : `${values.filter(Boolean).length}/${values.length}`;
const fixed = (value, digits = 3) => value === null || value === undefined ? '-' : value.toFixed(digits);

function compare(label, full, fork, digits) {
  const a = meanAndSd(full);
  const b = meanAndSd(fork);
  const p = full.length > 0 && fork.length > 0 ? mannWhitney(full, fork) : null;
  return `${label}: full ${fixed(a.mean, digits)} (sd ${fixed(a.sd, digits)}, n=${a.n}), fork ${fixed(b.mean, digits)} (sd ${fixed(b.sd, digits)}, n=${b.n}), Mann-Whitney p=${fixed(p, 3)}`;
}

// The lines the analysis prints. `fulls` hold each full cell's verify block and
// record, `forks` the fork records.
export function analysis(fulls, forks) {
  const numbers = (list, pick) => list.map(pick).filter((value) => typeof value === 'number');
  const fullCost = numbers(fulls, (full) => full.block.costUsd);
  const forkCost = numbers(forks, (fork) => fork.verifyCostUsd);
  const wholeFull = meanAndSd(numbers(fulls, (full) => full.record.costUsd)).mean;
  const wholeFork = meanAndSd(numbers(forks, (fork) => fork.costUsd)).mean;
  return [
    compare('verify cost USD', fullCost, forkCost, 3),
    compare('verify tokens', numbers(fulls, (full) => full.block.tokens), numbers(forks, (fork) => fork.verifyTokens), 0),
    compare('verify wall s', numbers(fulls, (full) => full.block.wallMs).map((ms) => ms / 1000), numbers(forks, (fork) => fork.verifyWallMs).map((ms) => ms / 1000), 0),
    `fix loop: full ${rate(fulls.map((full) => full.block.fixLoop))}, fork ${rate(forks.map((fork) => fork.fixLoop).filter((value) => value !== null))}`,
    `hidden test pass: full ${rate(fulls.map((full) => full.record.hiddenPass))}, fork ${rate(forks.map((fork) => fork.hiddenPass))}`,
    `fork total cost ${fixed(wholeFork)} / full cell cost ${fixed(wholeFull)} = ${wholeFull ? fixed(wholeFork / wholeFull, 2) : '-'}`
  ];
}

export function parseArguments(argv) {
  const options = { checkpoints: null, fullRuns: null, forks: null, out: null, confirm: false, analyse: false, dryRun: false, full: false, maxUsd: DEFAULT_MAX_USD };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--checkpoints') options.checkpoints = argv[++index];
    else if (flag === '--full-runs') options.fullRuns = argv[++index];
    else if (flag === '--forks') options.forks = Number(argv[++index]);
    else if (flag === '--out') options.out = argv[++index];
    else if (flag === '--max-usd') options.maxUsd = Number(argv[++index]);
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--analyse') options.analyse = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--full') options.full = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (options.fullRuns === null || options.out === null) throw new Error('name --full-runs <sweep out> and --out <dir>');
  if (!options.analyse && options.checkpoints === null) throw new Error('name --checkpoints <the --keep-repo folder>');
  if (options.dryRun && options.confirm) throw new Error('--dry-run starts nothing, so it cannot combine with --confirm');
  options.tier = options.full ? 'full' : 'quick';
  options.forks ??= options.full ? FULL_FORKS : QUICK_FORKS;
  if (!Number.isInteger(options.forks) || options.forks < 1) throw new Error('--forks must be a positive integer');
  if (!(options.maxUsd > 0)) throw new Error('--max-usd must be positive');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const fullRuns = path.resolve(options.fullRuns);
  const out = path.resolve(options.out);
  const fulls = fullCells(fullRuns).map((full) => ({ ...full, block: verifyBlock(full.transcript) }));
  if (options.analyse) {
    for (const line of analysis(fulls, forkRecords(out))) console.log(line);
    return;
  }
  const checkpoints = path.resolve(options.checkpoints);
  const usable = fulls.filter((full) => full.block.atMs !== null && fs.existsSync(path.join(checkpoints, full.name, 'repo')));
  const plan = usable.flatMap((full) => Array.from({ length: options.forks }, (_, index) => ({ full, directory: path.join(out, `${full.name}-fork-${index + 1}`) })));
  console.log(`${plan.length} verify-only forks planned (${options.tier} tier) from ${usable.length} kept cells, ${options.forks} each (${fulls.length - usable.length} cells skipped: no verify call or no kept repository):`);
  for (const { directory } of plan) console.log(`  ${path.basename(directory)}: --model ${forkCell().model} --effort ${forkCell().effort} --max-budget-usd ${FORK_BUDGET_USD}`);
  if (options.dryRun) {
    console.log(`dry run: nothing started; the plan costs ${Math.min(plan.length * FORK_BUDGET_USD, options.maxUsd)} USD at most.`);
    return;
  }
  if (!options.confirm) {
    console.log(`Every fork is billed, ${FORK_BUDGET_USD} USD at most each and ${options.maxUsd} USD at most together. Re-run with --confirm to start them.`);
    process.exitCode = 2;
    return;
  }
  let spent = 0;
  for (const { full, directory } of plan) {
    if (fs.existsSync(path.join(directory, 'record.json'))) {
      spent += readJson(path.join(directory, 'record.json')).costUsd ?? 0;
      continue;
    }
    if (spent + FORK_BUDGET_USD > options.maxUsd) {
      console.log(`stopped before ${path.basename(directory)}: ${spent.toFixed(3)} USD spent and the next fork may cost ${FORK_BUDGET_USD} USD, over the ${options.maxUsd} USD cap`);
      break;
    }
    const record = await runFork({ name: full.name, kept: path.join(checkpoints, full.name), fullTranscript: full.transcript, forkDirectory: directory });
    spent += record.costUsd ?? FORK_BUDGET_USD;
    console.log(`${path.basename(directory)} ${Math.round(record.wallMs / 1000)}s cost=${fixed(record.costUsd)} verify cost=${fixed(record.verifyCostUsd)} fixLoop=${record.fixLoop} hidden=${record.hiddenPass ? 'pass' : 'fail'} changed .exo files: ${record.changedExoFiles.join(', ') || 'none'}`);
  }
  for (const line of analysis(fulls, forkRecords(out))) console.log(line);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`checkpoint-fork: ${error.message}`);
    process.exitCode = 1;
  });
}
