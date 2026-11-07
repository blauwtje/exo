#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { UsageError, isMain, parseFlags } from '../lib/script-flags.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';
import { clusteredMeanCi, powerLine } from '../lib/eval-stats.mjs';
import { clusterOptions, extractRun, JUDGE_ARGUMENTS, JUDGE_HASH } from './ideas-score.mjs';
import { calibrationLines } from './judge-calibration.mjs';
import { makeCellHome } from './cell-home.mjs';
import { countsCost } from './pricing.mjs';
import { settingOf } from './agent-tier.mjs';
import { MODELS } from './tasks.mjs';
import { meanOrNull, readJson } from './basics.mjs';

const AGENT = 'ideate-worker';
export const VARIANTS = ['sonnet:low', 'sonnet:medium', 'opus:low'];
const FIXTURES = path.join(import.meta.dirname, 'agent-tier', 'ideate');
const DIMENSIONS = ['usefulness', 'specificity'];
const WIN_MARGIN = 0.03;
const DEFAULT_MAX_USD = 3;
const CALL_COUNTS = { input: 2500, output: 200 };
const FLAGS = { results: 'value', transcripts: 'value', tier: 'value', 'max-usd': 'value', out: 'value', base: 'value', 'dry-run': 'boolean' };
const USAGE = 'usage: ideate-worker-score.mjs --results <agent-tier.json> --transcripts <dir> [--tier quick|full] [--base <model:effort>] [--max-usd <n>] [--out <file>] [--dry-run]';
const SCORE = { A: 1, B: 0, tie: 0.5 };

const template = (name) => fs.readFileSync(path.join(FIXTURES, `judge-${name}.md`), 'utf8').trimEnd();

export function kindJudge(model, effort) {
  const args = [...JUDGE_ARGUMENTS.map((argument, index) => (JUDGE_ARGUMENTS[index - 1] === '--model' ? model : argument)), '--effort', effort];
  return ({ prompt }) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-ideate-worker-judge-'));
    const home = makeCellHome();
    const run = spawnSync('claude', args, { cwd, input: prompt, encoding: 'utf8', maxBuffer: 1 << 24, env: { ...process.env, HOME: home } });
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    if (run.status !== 0) throw new Error(`judge call failed: ${run.stderr.trim()}`);
    return run.stdout;
  };
}

function parseJson(text) {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function ask({ judge, prompt, valid }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parsed = parseJson(await judge({ prompt }));
    if (parsed !== null && valid(parsed)) return parsed;
  }
  return null;
}

export function finalTextOf(stdout) {
  let text = '';
  for (const line of stdout.split('\n')) {
    const event = parseJson(line);
    if (event?.type === 'result' && typeof event.result === 'string') text = event.result;
  }
  return text;
}

function loadRun({ session, transcripts }) {
  const file = path.join(transcripts, `${session.agent}-${session.model}-${session.effort}-${session.fixture}-r${session.run}.jsonl`);
  return {
    label: `${session.model}:${session.effort}`,
    fixture: session.fixture,
    run: session.run,
    text: finalTextOf(fs.readFileSync(file, 'utf8')),
    costUsd: session.cost_usd ?? null,
    seconds: typeof session.durationMs === 'number' ? session.durationMs / 1000 : null
  };
}

export function loadRuns({ sessions, transcripts, tier, fixtures }) {
  const wanted = new Set(fixtures[tier]);
  return sessions
    .filter((session) => session.agent === AGENT && !session.skipped && !session.error && wanted.has(session.fixture))
    .filter((session) => tier === 'full' || session.run === 1)
    .map((session) => loadRun({ session, transcripts }));
}

export function pairsOf({ runs, base }) {
  const baseRuns = runs.filter((run) => run.label === base);
  const repeats = Math.max(0, ...baseRuns.map((run) => run.run));
  const find = (fixture, number) => baseRuns.find((run) => run.fixture === fixture && run.run === number);
  return runs.flatMap((run) => {
    const opponentNumber = run.label === base ? (run.run % repeats) + 1 : run.run;
    const opponent = find(run.fixture, opponentNumber);
    if (opponent === undefined || opponent === run) return [];
    return [{ label: run.label, fixture: run.fixture, run, opponent }];
  });
}

async function verdictFor({ judge, dimension, question, first, second }) {
  const prompt = `${template(`pairwise-${dimension}`)}\n\nQuestion: ${question}\n\nAnswer A:\n${first.text}\n\nAnswer B:\n${second.text}`;
  const valid = (reply) => Object.hasOwn(SCORE, reply[dimension]);
  const reply = await ask({ judge, prompt, valid });
  return reply === null ? null : reply[dimension];
}

export async function judgePair({ judge, pair, question }) {
  const verdicts = [];
  for (const dimension of DIMENSIONS) {
    const forward = await verdictFor({ judge, dimension, question, first: pair.run, second: pair.opponent });
    const reversed = await verdictFor({ judge, dimension, question, first: pair.opponent, second: pair.run });
    if (forward !== null) verdicts.push({ dimension, value: SCORE[forward] });
    if (reversed !== null) verdicts.push({ dimension, value: 1 - SCORE[reversed] });
  }
  return verdicts;
}

async function defaultRate({ judge, options, defaults }) {
  if (options.length === 0) return null;
  const list = options.map((option, index) => `${index}. ${option.title}: ${option.mechanism}`).join('\n');
  const prompt = `${template('default')}\n\nDefaults:\n${defaults.map((line) => `- ${line}`).join('\n')}\n\nIdeas:\n${list}`;
  const valid = (reply) => Array.isArray(reply.matches) && reply.matches.every((index) => Number.isInteger(index) && index >= 0 && index < options.length);
  const reply = await ask({ judge, prompt, valid });
  if (reply === null) return null;
  return new Set(reply.matches).size / options.length;
}

export async function ideaMetrics({ judge, runs, question }) {
  const extracted = [];
  for (const run of runs) extracted.push((await extractRun({ judge, finalText: run.text })).options);
  const pooled = extracted.flat();
  const shapes = pooled.length === 0 ? [] : await clusterOptions({ judge, options: pooled });
  if (shapes === null) throw new Error(`cluster failed for ${question.id}, no repair loop`);
  const defaults = [...question.banned, ...question.heldBack];
  let offset = 0;
  const metrics = [];
  for (const options of extracted) {
    const own = shapes.slice(offset, offset + options.length);
    offset += options.length;
    const rate = await defaultRate({ judge, options, defaults });
    metrics.push({ distinct: options.length === 0 ? null : new Set(own).size, defaultRate: rate });
  }
  return metrics;
}

function clustered(items, valueOf) {
  const rows = items.map((item) => ({ cluster: item.fixture, value: valueOf(item) })).filter((row) => typeof row.value === 'number');
  return rows.length === 0 ? null : clusteredMeanCi(rows);
}

function fixtureMeans(runs, metric) {
  const byFixture = {};
  for (const fixture of new Set(runs.map((run) => run.fixture))) {
    const value = meanOrNull(runs.filter((run) => run.fixture === fixture && typeof run[metric] === 'number').map((run) => run[metric]));
    if (value !== null) byFixture[fixture] = value;
  }
  return byFixture;
}

const knownMean = (values) => meanOrNull(values.filter((value) => typeof value === 'number'));

export function summarize({ runs, pairs, metricsByRun }) {
  const labels = [...new Set(runs.map((run) => run.label))];
  return labels.map((label) => {
    const own = runs.filter((run) => run.label === label).map((run) => ({ ...run, ...metricsByRun.get(run) }));
    const ownPairs = pairs.filter((pair) => pair.label === label && pair.verdicts.length > 0);
    const valuesOf = (dimension) => ownPairs.flatMap((pair) => pair.verdicts.filter((verdict) => verdict.dimension === dimension).map((verdict) => verdict.value));
    return {
      label,
      winRate: clustered(ownPairs, (pair) => meanOrNull(pair.verdicts.map((verdict) => verdict.value))),
      byDimension: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, meanOrNull(valuesOf(dimension))])),
      cases: { distinct: fixtureMeans(own, 'distinct'), defaultRate: fixtureMeans(own, 'defaultRate') },
      distinct: clustered(own, (run) => run.distinct),
      defaultRate: clustered(own, (run) => run.defaultRate),
      costUsd: knownMean(own.map((run) => run.costUsd)),
      seconds: knownMean(own.map((run) => run.seconds))
    };
  });
}

const hasBounds = (interval) => interval !== null && interval.se !== null;

function notWorse({ variant, base, metric, higherIsBetter }) {
  const own = variant.cases?.[metric] ?? {};
  const reference = base.cases?.[metric] ?? {};
  const rows = Object.keys(own).filter((fixture) => fixture in reference).map((fixture) => ({ cluster: fixture, value: own[fixture] - reference[fixture] }));
  if (rows.length === 0) return false;
  const diff = clusteredMeanCi(rows);
  if (!hasBounds(diff)) return false;
  return higherIsBetter ? diff.hi >= 0 : diff.lo <= 0;
}

function beats({ row, reference, noise }) {
  if (!hasBounds(row.winRate)) return false;
  if (row.winRate.lo <= 0.5 || row.winRate.mean < noise + WIN_MARGIN) return false;
  if (!notWorse({ variant: row, base: reference, metric: 'distinct', higherIsBetter: true })) return false;
  return notWorse({ variant: row, base: reference, metric: 'defaultRate', higherIsBetter: false });
}

export function decide({ rows, base }) {
  const reference = rows.find((row) => row.label === base);
  const noise = reference?.winRate?.mean;
  if (noise === undefined) return `No decision: no ${base} self-pair rate for the noise floor; lib/model-kinds.json stays as is.`;
  const passing = rows
    .filter((row) => row.label !== base && beats({ row, reference, noise }))
    .sort((left, right) => (left.costUsd ?? Infinity) - (right.costUsd ?? Infinity));
  if (passing.length === 0) return `Decision: no variant beats ${base}; lib/model-kinds.json stays as is.`;
  if (passing.length === 1) return `Decision: ${passing[0].label} beats ${base}.`;
  return `Decision: ${passing[0].label} beats ${base} and is the cheaper of ${passing.map((row) => row.label).join(', ')}.`;
}

const fixed = (value) => (typeof value === 'number' ? Number(value.toFixed(3)) : 'n/a');
const withInterval = (interval) => (interval === null ? 'n/a' : `${fixed(interval.mean)} (${fixed(interval.lo)}..${fixed(interval.hi)})`);

export function resultsMarkdown({ rows, base, tier, judgeModel, calibration }) {
  const lines = [`# Ideate worker results: ${tier}`, '', `Judge: ${judgeModel}, ideas judge hash ${JUDGE_HASH.slice(0, 12)}, blind pairwise in both orders against ${base}`, ...calibration.map((line) => `Human calibration: ${line}`), ''];
  lines.push('| variant | win rate (ci95) | distinct ideas (ci95) | obvious-default rate (ci95) | usd per run | seconds per run |', '| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) lines.push(`| ${row.label} | ${withInterval(row.winRate)} | ${withInterval(row.distinct)} | ${withInterval(row.defaultRate)} | ${fixed(row.costUsd)} | ${fixed(row.seconds)} |`);
  const perDimension = rows.map((row) => `${row.label} ${DIMENSIONS.map((dimension) => `${dimension} ${fixed(row.byDimension[dimension])}`).join(', ')}`);
  lines.push('', `Per-dimension win rates: ${perDimension.join('; ')}`);
  lines.push(`The ${base} row is its own run against its next repeat, the noise floor.`, '', decide({ rows, base }), '');
  return lines.join('\n');
}

export function estimate({ runs, pairs, fixtureCount, judgeModel }) {
  const calls = runs.length * 2 + fixtureCount + pairs.length * DIMENSIONS.length * 2;
  const perCall = countsCost(CALL_COUNTS, MODELS[judgeModel] ?? judgeModel);
  return { calls, usd: perCall === null ? null : calls * perCall };
}

function planOf({ runs, pairs, fixtureCount, judgeModel }) {
  const { calls, usd } = estimate({ runs, pairs, fixtureCount, judgeModel });
  const arms = new Set(runs.map((run) => run.label)).size;
  const samples = Math.max(1, ...runs.map((run) => run.run));
  const spend = usd === null ? 'unpriced' : `$${usd.toFixed(2)}`;
  return { usd, lines: [`${calls} judge calls on ${judgeModel}, estimated ${spend}`, powerLine({ tasks: fixtureCount, samples, arms })] };
}

async function scoreAll({ judge, runs, pairs, questions }) {
  const metricsByRun = new Map();
  for (const question of questions) {
    const own = runs.filter((run) => run.fixture === question.id);
    const metrics = await ideaMetrics({ judge, runs: own, question });
    own.forEach((run, index) => metricsByRun.set(run, metrics[index]));
  }
  const judged = [];
  for (const pair of pairs) {
    const { question } = questions.find((entry) => entry.id === pair.fixture);
    judged.push({ ...pair, verdicts: await judgePair({ judge, pair, question }) });
  }
  return { metricsByRun, judged };
}

function baseLabel(table, flags) {
  if (flags.base !== undefined) return flags.base;
  const { model, effort } = settingOf(AGENT, table);
  return `${model}:${effort}`;
}

function dryRuns({ table, base, config, tier }) {
  const labels = [base, ...VARIANTS.filter((label) => label !== base)];
  const repeats = tier === 'full' ? 3 : 1;
  return labels.flatMap((label) => config.fixtures[tier].flatMap((fixture) => Array.from({ length: repeats }, (_, index) => ({ label, fixture, run: index + 1 }))));
}

function context(flags) {
  const tier = flags.tier ?? 'quick';
  if (!['quick', 'full'].includes(tier)) throw new UsageError('--tier is quick or full');
  const table = readKindTable();
  const config = readJson(path.join(FIXTURES, '..', 'agents.json'))[AGENT];
  const questions = readJson(path.join(FIXTURES, 'questions.json')).filter((question) => config.fixtures[tier].includes(question.id));
  return { tier, table, config, questions, base: baseLabel(table, flags) };
}

async function main(argv) {
  const flags = parseFlags(argv, FLAGS, { usage: USAGE });
  const dry = flags['dry-run'] === true;
  if (!dry && (flags.results === undefined || flags.transcripts === undefined)) throw new UsageError('--results and --transcripts are required');
  const { tier, table, config, questions, base } = context(flags);
  const runs = dry && flags.results === undefined ? dryRuns({ table, base, config, tier }) : loadRuns({ sessions: readJson(flags.results).sessions, transcripts: flags.transcripts, tier, fixtures: config.fixtures });
  const pairs = pairsOf({ runs, base });
  const judgeModel = table.kinds.judge.model;
  const plan = planOf({ runs, pairs, fixtureCount: questions.length, judgeModel });
  console.log(plan.lines.join('\n'));
  if (dry) return console.log('nothing spent');
  const maxUsd = Number(flags['max-usd'] ?? DEFAULT_MAX_USD);
  if (plan.usd === null || plan.usd > maxUsd) throw new UsageError(`estimated judge spend is over --max-usd ${maxUsd} or unpriced`);
  const { metricsByRun, judged } = await scoreAll({ judge: kindJudge(MODELS[judgeModel] ?? judgeModel, table.kinds.judge.effort), runs, pairs, questions });
  const calibration = calibrationLines(['ideate-worker-usefulness', 'ideate-worker-specificity']);
  const markdown = resultsMarkdown({ rows: summarize({ runs, pairs: judged, metricsByRun }), base, tier, judgeModel, calibration });
  if (flags.out === undefined) return console.log(markdown);
  fs.writeFileSync(flags.out, markdown);
  console.log(`wrote ${flags.out}`);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof UsageError ? `${USAGE}: ${error.message}` : error);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
