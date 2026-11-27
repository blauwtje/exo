#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain, POSITIVE_INTEGER } from '#script-flags';
import {
  coverageOf, distinctOrders, mean, minutesOf, parseLines, spreadOf, stampOverlap, stampTotals, tokensOf, toolOrder
} from './watch-bench-metrics.mjs';

const EVALS = fileURLToPath(new URL('./', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = [
  'usage: node watch-bench.mjs --metric <name|all> [--label <label>] [--repeat <n>] [--batch 30]',
  '       node watch-bench.mjs --compare baseline',
  'Metrics: tool-order stamp-overlap minutes tokens ytdlp-calls stamps hits coverage. Exit codes: 0 done; 1 a row is missing or a check failed; 2 bad usage; 75 rate limited.'
].join('\n');

const RATE_LIMITED_EXIT = 75;
const YTDLP_VIDEO = 'BBPQYtR7oUk';
const MINUTES_CASE = 'BBPQYtR7oUk';
const TOKENS_CASE = 'zjkBMFhNj_g';
const BATCH = 'batch';
const MD_HEADER = '| label | date | commit | row | value | runs | spread | errors |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
const percent = (share) => Math.round(share * 1000) / 10;

export const benchRoot = () => process.env.EXO_WATCH_BENCH_ROOT ?? EVALS;
export const resultsDirectory = () => path.join(benchRoot(), 'results', 'watch-bench');
export const tableFile = () => path.join(benchRoot(), 'watch-bench.md');
export const readCases = () => JSON.parse(fs.readFileSync(path.join(EVALS, 'watch-bench.cases.json'), 'utf8'));

const readIf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

function loadRun(directory) {
  const subagents = path.join(directory, 'subagents');
  const transcripts = path.join(directory, 'transcripts');
  return {
    answer: readIf(path.join(directory, 'answer.md')),
    lines: parseLines(readIf(path.join(directory, 'session.jsonl'))),
    subLines: fs.existsSync(subagents) ? fs.readdirSync(subagents).flatMap((name) => parseLines(readIf(path.join(subagents, name)))) : [],
    transcripts: fs.existsSync(transcripts) ? Object.fromEntries(fs.readdirSync(transcripts).map((name) => [name.replace(/\.txt$/, ''), readIf(path.join(transcripts, name))])) : {},
    meta: JSON.parse(readIf(path.join(directory, 'meta.json')) || '{"errors":["missing meta.json"]}'),
    verdicts: JSON.parse(readIf(path.join(directory, 'verdicts.json')) || '[]')
  };
}

export function loadPass(label) {
  const pass = {};
  for (const benchCase of readCases().cases) {
    const base = path.join(resultsDirectory(), label, benchCase.name);
    if (!fs.existsSync(base)) continue;
    pass[benchCase.name] = {
      benchCase,
      runs: fs.readdirSync(base).sort().map((name) => loadRun(path.join(base, name)))
    };
  }
  return pass;
}

const singles = (pass) => Object.values(pass).filter((entry) => entry.benchCase.name !== BATCH);
const errorRuns = (entries) => entries.flatMap((entry) => entry.runs).filter((run) => run.meta.errors.length > 0).length;
const runCount = (entries) => Math.min(...entries.map((entry) => entry.runs.length));

function summary(entries, values, value, note = '') {
  if (entries.length === 0 || values.length === 0) return null;
  return { value, ...spreadOf(values), runs: runCount(entries), errors: errorRuns(entries), note };
}

function perRun(pass, name, valueOf, reduce = mean) {
  const entries = pass[name] ? [pass[name]] : [];
  const values = entries.flatMap((entry) => entry.runs.map(valueOf));
  return summary(entries, values, reduce(values));
}

function perCase(pass, valueOf, reduce) {
  const entries = singles(pass);
  const values = entries.map(valueOf);
  return summary(entries, values, reduce(values));
}

function pooled(pass, countsOf) {
  const entries = Object.values(pass);
  const runs = entries.flatMap((entry) => entry.runs.map((run) => countsOf(run, entry.benchCase))).map((run) => (run.total === 0 ? { hit: 0, total: 1 } : run));
  const values = runs.map(({ hit, total }) => percent(total === 0 ? 0 : hit / total));
  const hit = runs.reduce((sum, run) => sum + run.hit, 0);
  const total = runs.reduce((sum, run) => sum + run.total, 0);
  return summary(entries, values, percent(total === 0 ? 0 : hit / total));
}

const minutesValue = (run) => (run.lines.length === 0 ? NaN : minutesOf(run.lines));

const minutesRow = (name) => (pass) => {
  const row = perRun(pass, name, minutesValue, (values) => values[0]);
  if (row === null) return null;
  const later = pass[name].runs.slice(1).map(minutesValue);
  return { ...row, note: later.length ? `mean of runs 2 and 3: ${mean(later).toFixed(2)}` : '' };
};

export const ROWS = [
  { key: 'tool-order', metric: 'tool-order', batch: false, goal: 1, better: 'lower', compute: (pass) => perCase(pass, (entry) => distinctOrders(entry.runs.map((run) => toolOrder(run.lines))), (values) => Math.max(...values)) },
  { key: 'stamp-overlap', metric: 'stamp-overlap', batch: false, goal: 80, better: 'higher', compute: (pass) => perCase(pass, (entry) => percent(stampOverlap(entry.runs.map((run) => run.answer)).shared), mean) },
  { key: 'minutes', metric: 'minutes', batch: false, goal: 0.5, better: 'lower', compute: minutesRow(MINUTES_CASE) },
  { key: 'minutes-batch', metric: 'minutes', batch: true, goal: 5, better: 'lower', compute: minutesRow(BATCH) },
  { key: 'ytdlp-calls', metric: 'ytdlp-calls', batch: false, goal: 0, better: 'lower', compute: () => null },
  { key: 'tokens', metric: 'tokens', batch: false, goal: 25000, better: 'lower', compute: (pass) => perRun(pass, TOKENS_CASE, (run) => tokensOf(run.lines).fresh + tokensOf(run.subLines).fresh) },
  { key: 'tokens-lead-batch', metric: 'tokens', batch: true, goal: 2500, better: 'lower', compute: (pass) => perRun(pass, BATCH, (run) => tokensOf(run.lines).fresh / pass[BATCH].benchCase.ids.length) },
  { key: 'tokens-helper-batch', metric: 'tokens', batch: true, goal: 9000, better: 'lower', compute: (pass) => perRun(pass, BATCH, (run) => tokensOf(run.subLines).fresh / pass[BATCH].benchCase.ids.length) },
  { key: 'stamps', metric: 'stamps', batch: false, goal: 100, better: 'higher', compute: (pass) => pooled(pass, (run) => {
    const { exact, off } = stampTotals(run.answer, run.transcripts);
    return { hit: exact, total: exact + off };
  }) },
  { key: 'hits', metric: 'hits', batch: false, goal: 95, better: 'higher', compute: (pass) => pooled(pass, (run) => ({ hit: run.verdicts.filter((verdict) => verdict === 'pass').length, total: run.verdicts.length })) },
  { key: 'coverage', metric: 'coverage', batch: false, goal: 90, better: 'higher', compute: (pass) => {
    const entries = Object.values(pass);
    const values = entries.flatMap((entry) => entry.runs.map((run) => percent(coverageOf(run.answer, entry.benchCase))));
    return summary(entries, values, mean(values));
  } }
];

export function passRows(label) {
  const pass = loadPass(label);
  return ROWS.flatMap((row) => {
    const computed = row.compute(pass);
    return computed === null ? [] : [{ row: row.key, ...computed }];
  });
}

const formatRow = (label, date, commit, row) => `| ${label} | ${date} | ${commit} | ${row.row} | ${Math.round(row.value * 100) / 100} | ${row.runs} | ${Math.round(row.low * 100) / 100} to ${Math.round(row.high * 100) / 100} | ${row.errors} |\n`;

export function appendRows(label, rows, commit) {
  const file = tableFile();
  const date = new Date().toISOString().slice(0, 10);
  const head = fs.existsSync(file) ? '' : MD_HEADER;
  fs.appendFileSync(file, head + rows.map((row) => formatRow(label, date, commit, row)).join(''));
}

export function dropRows(label) {
  const file = tableFile();
  if (!fs.existsSync(file)) return 0;
  const kept = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.split('|')[1]?.trim() !== label);
  fs.writeFileSync(file, kept.join('\n'));
  return 0;
}

export function tableRows(label) {
  return readIf(tableFile()).split('\n').flatMap((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 8 || cells[0] !== label || Number.isNaN(Number(cells[4]))) return [];
    const [low, high] = cells[6].split(' to ').map(Number);
    return [{ row: cells[3], value: Number(cells[4]), runs: Number(cells[5]), low, high, errors: Number(cells[7]) }];
  });
}

const latest = (rows) => new Map(rows.map((row) => [row.row, row]));

export function compareRows(baseline, after) {
  const before = latest(baseline);
  const now = latest(after);
  return ROWS.map((spec) => {
    const was = before.get(spec.key);
    const is = now.get(spec.key);
    if (!was || !is) return { key: spec.key, goal: spec.goal, was, is, verdict: 'missing' };
    const sign = spec.better === 'lower' ? -1 : 1;
    const spread = Math.max(was.high - was.low, is.high - is.low);
    const change = (is.value - was.value) * sign;
    const metGoal = spec.better === 'lower' ? is.value <= spec.goal : is.value >= spec.goal;
    const wasMetGoal = spec.better === 'lower' ? was.value <= spec.goal : was.value >= spec.goal;
    let verdict = 'same';
    if (change < -spread) verdict = 'worse';
    else if (!metGoal && !(wasMetGoal && Math.abs(change) <= spread)) verdict = 'short of goal';
    else if (change > spread) verdict = 'moved';
    return { key: spec.key, goal: spec.goal, was, is, verdict };
  });
}

export function standIn(directory) {
  const file = path.join(directory, 'yt-dlp-count.sh');
  const real = (process.env.EXO_YTDLP ?? 'yt-dlp').replaceAll("'", "'\\''");
  fs.writeFileSync(file, `#!/bin/sh\ncase "$*" in *--version*) ;; *) echo call >> "$EXO_BENCH_COUNT";; esac\nexec '${real}' "$@"\n`, { mode: 0o755 });
  return file;
}

export const callsIn = (file) => readIf(file).split('\n').filter(Boolean).length;

export function ytdlpCalls(repeat) {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-watch-ytdlp-')));
  const stand = standIn(work);
  const store = path.join(work, 'store');
  const counts = [];
  for (let run = 1; run <= repeat; run += 1) {
    const cwd = path.join(work, `run-${run}`);
    fs.mkdirSync(cwd);
    const count = path.join(work, `count-${run}.txt`);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'skills/watch/scripts/transcript.mjs'), '--url', `https://www.youtube.com/watch?v=${YTDLP_VIDEO}`], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, EXO_WATCH_STORE: store, EXO_YTDLP: stand, EXO_BENCH_COUNT: count }
    });
    if (result.status === RATE_LIMITED_EXIT) return { counts, rateLimited: true };
    counts.push(callsIn(count));
  }
  return { counts, rateLimited: false };
}

const newestLabel = () => {
  const directory = resultsDirectory();
  const labels = fs.existsSync(directory) ? fs.readdirSync(directory).map((name) => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs })) : [];
  return labels.sort((a, b) => b.time - a.time)[0]?.name;
};

const line = (row) => `${row.row}: ${row.value} (runs ${row.runs}, spread ${row.low} to ${row.high}, error rows ${row.errors})${row.note ? `, ${row.note}` : ''}`;

function printYtdlp(repeat) {
  const { counts, rateLimited } = ytdlpCalls(repeat);
  counts.forEach((count, index) => console.log(`run ${index + 1}: ${count}`));
  if (rateLimited) return RATE_LIMITED_EXIT;
  return counts.at(-1) > 0 ? 1 : 0;
}

function printMetric(flags) {
  const repeat = flags.repeat === undefined ? 1 : Number(flags.repeat);
  if (flags.metric === 'ytdlp-calls') return printYtdlp(flags.repeat === undefined ? 2 : repeat);
  const label = flags.label ?? newestLabel();
  if (label === undefined) {
    console.error('no benchmark pass is kept; run evals/watch-bench-run.mjs first');
    return 1;
  }
  const rows = flags.metric === 'all' ? tableRows(label) : passRows(label).filter((row) => ROWS.find((spec) => spec.key === row.row && spec.metric === flags.metric && spec.batch === (flags.batch !== undefined)));
  rows.forEach((row) => console.log(line(row)));
  if (flags.metric === 'all') {
    const missing = ROWS.filter((spec) => !rows.some((row) => row.row === spec.key)).map((spec) => spec.key);
    const errors = rows.reduce((sum, row) => sum + row.errors, 0);
    console.log(`error rows: ${errors}`);
    if (missing.length > 0) console.error(`label ${label} has no row for: ${missing.join(', ')}`);
    return missing.length > 0 ? 1 : 0;
  }
  if (rows.length === 0) {
    console.error(`label ${label} holds no data for metric ${flags.metric}`);
    return 1;
  }
  const short = rows.filter((row) => row.runs < repeat);
  short.forEach((row) => console.error(`${row.row} holds ${row.runs} runs, fewer than --repeat ${repeat}`));
  return short.length > 0 ? 1 : 0;
}

function printCompare(baselineLabel) {
  const baseline = tableRows(baselineLabel);
  const after = tableRows('after');
  const results = compareRows(baseline, after);
  for (const { key, goal, was, is, verdict } of results) {
    console.log(`${key}: baseline ${was?.value ?? 'missing'}, after ${is?.value ?? 'missing'}, goal ${goal}, ${verdict}`);
  }
  const errors = after.reduce((sum, row) => sum + row.errors, 0);
  console.log(`error rows in after: ${errors}`);
  return results.some((result) => result.verdict === 'missing') || errors > 0 ? 1 : 0;
}

function main(argv) {
  const flags = parseFlags(argv, { metric: 'string', label: 'string', repeat: 'string', batch: 'string', compare: 'string' }, { usage: USAGE });
  if (flags.repeat !== undefined && !POSITIVE_INTEGER.test(flags.repeat)) throw new UsageError('--repeat needs a positive whole number');
  if (flags.batch !== undefined && flags.batch !== '30') throw new UsageError('--batch takes 30');
  if (flags.compare !== undefined) return printCompare(flags.compare);
  if (flags.metric === undefined) throw new UsageError('give --metric <name|all> or --compare baseline');
  const known = ['all', ...new Set(ROWS.map((row) => row.metric))];
  if (!known.includes(flags.metric)) throw new UsageError(`unknown metric '${flags.metric}'; known: ${known.join(', ')}`);
  return printMetric(flags);
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
