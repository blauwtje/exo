#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { confineRefusal, confinedClaude } from '#confine-claude';
import { makeDefaultOptionsHome } from '#default-options-home';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { withHome } from '../skills/edit-skills/scripts/pressure-home.mjs';
import { clusteredMeanCi } from '../lib/eval-stats.mjs';
import { intervalText, knownMean, pairedArms, pairedByCase, verdictWord } from './interval-text.mjs';
import { plannedPowerLine, scoresByTask } from './power-plan.mjs';
import { readJson } from './basics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_FILE = path.join(ROOT, 'benchmarks/locate-recall/briefs.json');
const RESULTS = path.join(ROOT, 'benchmarks/results');
const SESSION_MS = environmentMs('EXO_LOCATE_SESSION_MS', 240_000);
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const STDERR_TAIL = 500;
const REPORT_LINES = 30;
const TIER_DEFAULTS = {
  quick: { runs: 1, out: path.join(RESULTS, 'locate-recall-quick.json') },
  full: { runs: 3, out: path.join(RESULTS, 'locate-recall.json') }
};
const USAGE = `usage: locate-recall.mjs [--full] [--models <a,b>] [--runs <n>] [--brief <id>] [--agent <name>] [--effort <level>] [--concurrency <n>] [--transcripts <dir>] [--dry-run] [--out <file>]
Default: the quick briefs of benchmarks/locate-recall/briefs.json, one run per model, against the repository files at the pinned fixture commit, written to benchmarks/results/locate-recall-quick.json.
--full runs every brief, 3 runs per model, and writes benchmarks/results/locate-recall.json. --brief runs one brief by id.
Each session runs the agent in a scratch copy of the fixture commit; recall is the share of the expected files named in the return text, precision the share of named files that are expected or acceptable.
An errored or timed-out session counts as recall 0 and is left out of the precision, cost and wall means, each printed with its excluded count; recall carries a brief-clustered SE.
With two or more models it prints the paired per-brief recall difference of each later model against the first, as 'no SE' when fewer than 2 briefs are paired.
--dry-run spends nothing and prints the session count times the median cost_usd recorded in --out. Defaults: --models haiku,sonnet, --agent exo:locate-code, --effort medium, --concurrency 4.`;

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, name) => new RegExp(`(?<![\\w./-])${escaped(name)}(?![\\w-])`).test(text);
const share = (part, whole) => (whole === 0 ? null : part / whole);

export function mentionedFiles(text, files) {
  const counts = new Map();
  for (const file of files) counts.set(path.basename(file), (counts.get(path.basename(file)) ?? 0) + 1);
  return files.filter((file) => mentions(text, file) || (counts.get(path.basename(file)) === 1 && mentions(text, path.basename(file))));
}

export function gradeReturn(text, brief, files) {
  const named = mentionedFiles(text, files);
  const relevant = new Set([...brief.expected, ...(brief.acceptable ?? [])]);
  const found = brief.expected.filter((file) => named.includes(file));
  return {
    recall: share(found.length, brief.expected.length),
    precision: share(named.filter((file) => relevant.has(file)).length, named.length),
    found,
    missed: brief.expected.filter((file) => !found.includes(file)),
    extra: named.filter((file) => !relevant.has(file))
  };
}

export function resultOfStream(text) {
  for (const line of text.split('\n').reverse()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== 'result') continue;
    return { text: typeof event.result === 'string' ? event.result : '', cost_usd: event.total_cost_usd ?? null, numTurns: event.num_turns ?? null, error: event.is_error ? String(event.result) : undefined };
  }
  return null;
}

export function reportHead(texts) {
  return texts.join('\n').split('\n').slice(0, REPORT_LINES).join('\n');
}

export function medianCost(sessions) {
  const costs = sessions.map((session) => session.cost_usd).filter((cost) => typeof cost === 'number').sort((a, b) => a - b);
  if (costs.length === 0) return null;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}

export function dryRunLine(sessionCount, recorded) {
  const median = medianCost(recorded);
  if (median === null) return `dry-run: ${sessionCount} sessions, cost unknown`;
  const excluded = recorded.filter((session) => typeof session.cost_usd !== 'number').length;
  return `dry-run: ${sessionCount} sessions x median $${median.toFixed(4)} = $${(sessionCount * median).toFixed(2)} (${excluded} of ${recorded.length} recorded sessions without cost excluded)`;
}

const recallOf = (session, field) => (session.error ? 0 : session[field]);

function clusteredGrade(sessions, field) {
  const rows = sessions.map((session) => ({ cluster: session.brief, value: recallOf(session, field) })).filter((row) => typeof row.value === 'number');
  return rows.length === 0 ? null : clusteredMeanCi(rows);
}

function precisionOf(sessions) {
  return knownMean(sessions.map((session) => (session.error ? null : session.precision)));
}

function sumKnown(values) {
  return values.filter((value) => typeof value === 'number').reduce((sum, value) => sum + value, 0);
}

export function summarize(sessions, models) {
  return Object.fromEntries(models.map((model) => {
    const own = sessions.filter((session) => session.model === model);
    const graded = own.filter((session) => !session.error);
    const recall = clusteredGrade(own, 'recall');
    const reportRecall = clusteredGrade(own, 'reportRecall');
    const precision = precisionOf(own);
    const cost = knownMean(graded.map((session) => session.cost_usd));
    const wall = knownMean(graded.map((session) => session.durationMs / 1000));
    return [model, {
      sessions: own.length,
      errors: own.length - graded.length,
      recall: recall?.mean ?? null,
      recallSe: recall?.se ?? null,
      precision: precision.interval?.mean ?? null,
      precisionSe: precision.interval?.se ?? null,
      precisionExcluded: precision.excluded,
      reportRecall: reportRecall?.mean ?? null,
      cost_usd: sumKnown(own.map((session) => session.cost_usd)),
      meanCostUsd: cost.interval?.mean ?? null,
      costExcluded: own.length - cost.total + cost.excluded,
      meanWallS: wall.interval?.mean ?? null,
      wallExcluded: own.length - wall.total + wall.excluded
    }];
  }));
}

export function modelComparisons(sessions, models) {
  const cases = pairedByCase(sessions, (session) => [session.brief, session.model, recallOf(session, 'recall') ?? 0]);
  return models.slice(1).map((model) => {
    const diff = pairedArms(cases, models[0], model);
    return { base: models[0], model, diff, verdict: verdictWord(diff) };
  });
}

export function plannedBriefs(fixture, { full, brief }) {
  if (brief !== undefined) {
    const chosen = fixture.briefs.filter((entry) => entry.id === brief);
    if (chosen.length === 0) throw new UsageError(`--brief '${brief}' is not in the fixture`);
    return chosen;
  }
  return full ? fixture.briefs : fixture.briefs.filter((entry) => entry.quick);
}

function readFlags(argv) {
  const flags = parseFlags(argv, { full: 'boolean', models: 'value', runs: 'value', brief: 'value', agent: 'value', effort: 'value', concurrency: 'value', transcripts: 'value', 'dry-run': 'boolean', out: 'value' }, { usage: USAGE });
  for (const name of ['runs', 'concurrency']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  const full = flags.full === true;
  const tier = TIER_DEFAULTS[full ? 'full' : 'quick'];
  return {
    full,
    models: (flags.models ?? 'haiku,sonnet').split(','),
    runs: Number(flags.runs ?? tier.runs),
    brief: flags.brief,
    agent: flags.agent ?? 'exo:locate-code',
    effort: flags.effort ?? 'medium',
    concurrency: Number(flags.concurrency ?? 4),
    transcripts: flags.transcripts,
    dryRun: flags['dry-run'] === true,
    out: flags.out ?? tier.out
  };
}

export function readFixture() {
  return readJson(FIXTURE_FILE);
}

function recordedSessions(file) {
  if (!fs.existsSync(file)) return [];
  return readJson(file).sessions ?? [];
}

export function fixtureFiles(commit) {
  return execFileSync('git', ['-C', ROOT, 'ls-tree', '-r', '--name-only', commit], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
}

function makeScratch(commit) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'locate-recall-'));
  const [scratch, tmp] = ['scratch', 'tmp'].map((name) => path.join(folder, name));
  for (const dir of [scratch, tmp]) fs.mkdirSync(dir);
  execFileSync('sh', ['-c', 'git -C "$1" archive "$2" | tar -x -C "$3"', 'sh', ROOT, commit, scratch]);
  return { folder, scratch, tmp };
}

function reportTexts(scratch) {
  const folder = path.join(scratch, '.exo', 'locate');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).sort().map((name) => fs.readFileSync(path.join(folder, name), 'utf8'));
}

function saveTranscript(directory, name, stdout, reports) {
  if (directory === undefined) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${name}.jsonl`), stdout);
  if (reports.length > 0) fs.writeFileSync(path.join(directory, `${name}.report.md`), reports.join('\n'));
}

export function agentArguments({ prompt, agent, model, effort, pluginDir }) {
  return ['-p', ...(agent ? ['--agent', agent] : []), '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--plugin-dir', pluginDir, '--', prompt];
}

export function runAgent({ prompt, agent, model, effort, cwd, roots, tmp, home, pluginDir = ROOT, timeoutMs = SESSION_MS }) {
  const startedAt = Date.now();
  const args = agentArguments({ prompt, agent, model, effort, pluginDir });
  const run = withHome(confinedClaude({ args, roots, cwd, tmp }), home);
  return new Promise((resolve) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve({ ...outcome, stdout, durationMs: Date.now() - startedAt });
    };
    const timer = setTimeout(() => finish({ error: `timeout after ${timeoutMs} ms` }), timeoutMs);
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL); });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', (error) => finish({ error: `spawn failed: ${error.message}` }));
    child.on('close', (code, signal) => {
      const result = resultOfStream(stdout);
      if (result) return finish(result);
      finish({ error: `${signal ? `signal ${signal}` : `exit ${code}`}: ${stderr.trim() || 'no stderr'}` });
    });
  });
}

export async function claudeSession({ prompt, model, flags, commit, home }) {
  const { folder, scratch, tmp } = makeScratch(commit);
  const outcome = await runAgent({ prompt, agent: flags.agent, model, effort: flags.effort, cwd: scratch, roots: [scratch, tmp], tmp, home });
  const reports = reportTexts(scratch);
  fs.rmSync(folder, { recursive: true, force: true });
  return { ...outcome, reports };
}

export async function inPool(jobs, concurrency) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const at = next++;
      results[at] = await jobs[at]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

export function gradedSession({ brief, model, run, outcome, files }) {
  const base = { model, brief: brief.id, run, cost_usd: outcome.cost_usd ?? null, durationMs: outcome.durationMs, numTurns: outcome.numTurns ?? null };
  if (outcome.error) return { ...base, error: outcome.error };
  const returned = gradeReturn(outcome.text, brief, files);
  const report = gradeReturn(reportHead(outcome.reports), brief, files);
  return { ...base, ...returned, reportRecall: report.recall, returnText: outcome.text };
}

export async function evaluate({ briefs, models, runs, concurrency, files, runSession }) {
  const jobs = [];
  for (const brief of briefs) {
    for (const model of models) {
      for (let run = 1; run <= runs; run++) {
        jobs.push(async () => gradedSession({ brief, model, run, outcome: await runSession({ brief, model, run }), files }));
      }
    }
  }
  return inPool(jobs, concurrency);
}

function dryRun(flags) {
  const briefs = plannedBriefs(readFixture(), flags);
  const sessionCount = briefs.length * flags.models.length * flags.runs;
  const recorded = recordedSessions(flags.out);
  process.stdout.write(`${dryRunLine(sessionCount, recorded)}\n`);
  const scores = scoresByTask(recorded, { task: (session) => session.brief, score: (session) => (session.error ? 0 : session.recall) });
  process.stdout.write(`${plannedPowerLine({ tasks: briefs.length, samples: flags.runs, arms: flags.models.length, recorded: scores })}\n`);
}

const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);

const withSe = (value, se) => `${percent(value)} ${se === null ? 'no SE' : `se ${percent(se)}`}`;

function summaryLines(summary) {
  return Object.entries(summary).map(([model, row]) => {
    const wall = row.meanWallS === null ? 'n/a' : `${row.meanWallS.toFixed(1)} s`;
    return `${model}: recall ${withSe(row.recall, row.recallSe)} precision ${withSe(row.precision, row.precisionSe)} (${row.precisionExcluded} excluded) report-recall ${percent(row.reportRecall)} cost $${row.cost_usd.toFixed(4)} mean wall ${wall} (${row.wallExcluded} excluded) errors ${row.errors}/${row.sessions}`;
  });
}

export function comparisonLines(comparisons) {
  return comparisons.map(({ base, model, diff, verdict }) => `${model} minus ${base} recall, paired per brief: ${intervalText(diff)} ${verdict}`);
}

async function main() {
  const flags = readFlags(process.argv.slice(2));
  if (flags.dryRun) return dryRun(flags);
  const refusal = confineRefusal();
  if (refusal) throw new UsageError(refusal);
  const fixture = readFixture();
  const briefs = plannedBriefs(fixture, flags);
  const files = fixtureFiles(fixture.commit);
  const home = makeDefaultOptionsHome({ withoutInstalledPlugins: true });
  const transcripts = flags.transcripts ?? path.join(ROOT, '.exo', 'locate-recall', new Date().toISOString().replace(/[:.]/g, '-'));
  try {
    const runSession = async ({ brief, model, run }) => {
      const outcome = await claudeSession({ prompt: brief.prompt, model, flags, commit: fixture.commit, home });
      saveTranscript(transcripts, `${model}-${brief.id}-${run}`, outcome.stdout, outcome.reports);
      return outcome;
    };
    const sessions = await evaluate({ briefs, models: flags.models, runs: flags.runs, concurrency: flags.concurrency, files, runSession });
    const summary = summarize(sessions, flags.models);
    const comparisons = modelComparisons(sessions, flags.models);
    const result = { commit: fixture.commit, agent: flags.agent, effort: flags.effort, tier: flags.full ? 'full' : 'quick', runs: flags.runs, transcripts, summary, comparisons, sessions };
    fs.mkdirSync(path.dirname(flags.out), { recursive: true });
    fs.writeFileSync(flags.out, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${[...summaryLines(summary), ...comparisonLines(comparisons)].join('\n')}\nwrote ${flags.out}\n`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
