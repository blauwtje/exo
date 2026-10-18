import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { makeCellHome } from './cell-home.mjs';
import { compareMeans, meanAndSd, minDetectableMeanEffect } from './statistics.mjs';

const PROMPTS = path.join(import.meta.dirname, 'ideas');
const JUDGE_MODEL = 'claude-sonnet-5-5';
const SCORE_CALLS = 3;
const STRONG_MIN = 4;
const CALIBRATION_SHARE = 0.8;
export const METRICS = ['strong', 'options', 'shapes', 'duplicateShare', 'originality', 'fit', 'rare', 'recommendedOriginality', 'recommendedFit', 'tokens', 'costUsd'];

// why: user settings enable every installed plugin and HOME carries the global CLAUDE.md; skipping both keeps the judge blind to exo and the user's rules.
export const JUDGE_ARGUMENTS = ['-p', '--model', JUDGE_MODEL, '--setting-sources', 'project,local', '--strict-mcp-config', '--tools', '', '--disable-slash-commands'];

export function claudeJudge({ prompt }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-ideas-judge-'));
  const home = makeCellHome();
  const run = spawnSync('claude', JUDGE_ARGUMENTS, { cwd, input: prompt, encoding: 'utf8', maxBuffer: 1 << 24, env: { ...process.env, HOME: home } });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  if (run.status !== 0) throw new Error(`judge call failed: ${run.stderr.trim()}`);
  return run.stdout;
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

function template(name) {
  return fs.readFileSync(path.join(PROMPTS, `judge-${name}.md`), 'utf8').trimEnd();
}

export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export async function extractRun({ judge, finalText }) {
  const prompt = `${template('extract')}\n\n${finalText}`;
  const valid = (reply) => Array.isArray(reply.options) && reply.options.every((o) => typeof o.title === 'string');
  const reply = await ask({ judge, prompt, valid });
  if (reply === null) return { options: [], recommended: null, failed: true };
  const recommended = Number.isInteger(reply.recommended) && reply.options[reply.recommended] ? reply.recommended : null;
  return { options: reply.options, recommended, failed: false };
}

export async function clusterOptions({ judge, options, random }) {
  const order = shuffled(options.map((_, index) => index), random);
  const list = order.map((original, position) => `${position}. ${options[original].title}: ${options[original].mechanism}`).join('\n');
  const valid = (reply) => Array.isArray(reply.assignments) && order.every((_, position) => reply.assignments.some((a) => a.option === position));
  const reply = await ask({ judge, prompt: `${template('cluster')}\n\n${list}`, valid });
  if (reply === null) return null;
  const shapeOf = new Map();
  for (const { option, shape } of reply.assignments) shapeOf.set(order[option], shape);
  return options.map((_, index) => shapeOf.get(index));
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const inScale = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

export async function scoreOption({ judge, problem, option }) {
  const prompt = `${template('score')}\n\nProblem: ${problem}\nOption: ${option.title}: ${option.mechanism}`;
  const valid = (reply) => inScale(reply.originality) && inScale(reply.fit);
  const replies = [];
  for (let call = 0; call < SCORE_CALLS; call += 1) replies.push(await ask({ judge, prompt, valid }));
  const good = replies.filter((reply) => reply !== null);
  if (good.length < SCORE_CALLS) return null;
  return { originality: median(good.map((r) => r.originality)), fit: median(good.map((r) => r.fit)) };
}

export function calibration(controls) {
  const checks = controls.flatMap(({ key, got }) => [
    got !== null && Math.abs(got.originality - key.originality) <= 1,
    got !== null && Math.abs(got.fit - key.fit) <= 1
  ]);
  const share = checks.length === 0 ? 0 : checks.filter(Boolean).length / checks.length;
  return { share, passed: share >= CALIBRATION_SHARE };
}

const mean = (values) => (values.length === 0 ? null : meanAndSd(values).mean);

export function runRecord({ caseId, run, options, shapes, recommended, tokens = null, costUsd = null }) {
  const shapeIds = new Set(options.map((_, index) => shapes[index]));
  const scored = options.filter((option) => option.scores);
  // why: absent stays null, never 0, so a run without a recommended index, a score or usage drops out of that mean.
  const picked = recommended === null ? undefined : options[recommended]?.scores;
  return {
    case: caseId,
    run,
    options: options.length,
    shapes: shapeIds.size,
    duplicateShare: options.length === 0 ? 0 : (options.length - shapeIds.size) / options.length,
    originality: mean(scored.map((o) => o.scores.originality)),
    fit: mean(scored.map((o) => o.scores.fit)),
    strong: scored.filter((o) => o.scores.originality >= STRONG_MIN && o.scores.fit >= STRONG_MIN).length,
    shapeSet: [...shapeIds],
    recommendedShape: recommended === null ? null : shapes[recommended],
    recommendedOriginality: picked?.originality ?? null,
    recommendedFit: picked?.fit ?? null,
    tokens,
    costUsd
  };
}

export function addRarity(records) {
  const holders = new Map();
  for (const record of records) {
    for (const shape of record.shapeSet) holders.set(shape, (holders.get(shape) ?? 0) + 1);
  }
  for (const record of records) {
    const unique = record.shapeSet.filter((shape) => holders.get(shape) === 1);
    record.rare = record.shapeSet.length === 0 ? 0 : unique.length / record.shapeSet.length;
  }
  return records;
}

// First-idea convergence: share of a case's runs whose recommended shape is that case's most common recommended shape.
export function modalShare({ records }) {
  const counts = new Map();
  for (const record of records) {
    if (record.recommendedShape !== null) counts.set(record.recommendedShape, (counts.get(record.recommendedShape) ?? 0) + 1);
  }
  const recommending = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (recommending === 0) return null;
  return Math.max(...counts.values()) / recommending;
}

export function decisions({ means, modal }) {
  const wide = means.shapes < 3 || means.originality < 3;
  const lines = [
    `A1 wider sketch with fixed roles: ${wide ? 'needed' : 'not needed'} (mean shapes ${means.shapes}, mean originality ${means.originality})`,
    `A2 one subagent per candidate: ${means.duplicateShare >= 0.2 ? 'needed' : 'not needed'} (mean duplicateShare ${means.duplicateShare})`,
    `A3 code-cliche list: ${modal >= 0.6 || means.rare < 0.2 ? 'needed' : 'not needed'} (mean modalShare ${modal}, mean rare ${means.rare})`
  ];
  return lines;
}

const RULE_TEXT = [
  'Decision rule, fixed before any score:',
  '- A1 (wider sketch with fixed roles) needed when mean shapes < 3 or mean originality < 3.',
  '- A2 (one subagent per candidate) needed when mean duplicateShare >= 0.2.',
  '- A3 (code-cliche list) needed when mean modalShare >= 0.6 or mean rare < 0.2.',
  '- Needed means worth a variant arm; adoption waits for that arm to beat baseline by more than the minimum detectable effect.'
];

const fixed = (value) => (value === null || value === undefined ? 'n/a' : Number(value.toFixed(3)));

export function summarizeMetrics(records) {
  const rows = {};
  for (const metric of METRICS) {
    const values = records.map((record) => record[metric]).filter((value) => value !== null && value !== undefined);
    const { mean: avg, sd, n } = meanAndSd(values);
    rows[metric] = { mean: avg, sd, n, mde: sd === null ? null : minDetectableMeanEffect({ sd, n }) };
  }
  return rows;
}

export function resultsMarkdown({ arm, records, caseShares, verdict, unscored, failed = [] }) {
  const rows = summarizeMetrics(records);
  const means = Object.fromEntries(METRICS.map((metric) => [metric, rows[metric].mean]));
  const modal = mean(Object.values(caseShares).filter((share) => share !== null));
  const lines = [`# Ideas results: ${arm}`, '', ...RULE_TEXT, ''];
  lines.push(`Judge calibration: ${fixed(verdict.share)} of control scores within 1 of the key, ${verdict.passed ? 'calibrated' : 'judge uncalibrated'}`, '');
  lines.push('| metric | mean | sd | n | minimum detectable effect |', '| --- | --- | --- | --- | --- |');
  const mde = (row) => (row.sd === 0 ? 'n/a (sd 0)' : fixed(row.mde));
  for (const metric of METRICS) lines.push(`| ${metric} | ${fixed(rows[metric].mean)} | ${fixed(rows[metric].sd)} | ${rows[metric].n} | ${mde(rows[metric])} |`);
  const flat = METRICS.filter((metric) => rows[metric].sd === 0).map((metric) => `${metric} ${fixed(rows[metric].mean)}`);
  lines.push('', `At a floor or ceiling (sd 0, no detectable effect): ${flat.length === 0 ? 'none' : flat.join(', ')}`);
  lines.push('', `modalShare per case: ${Object.entries(caseShares).map(([id, share]) => `${id} ${fixed(share)}`).join(', ')}`, '');
  lines.push('Decision:', ...(verdict.passed ? decisions({ means, modal }).map((line) => `- ${line}`) : ['- none drawn, judge uncalibrated']), '');
  lines.push(`Failed runs, left out of every metric and n: ${failed.length === 0 ? 'none' : failed.join(', ')}`, '');
  lines.push(`Unscored items: ${unscored.length === 0 ? 'none' : unscored.join(', ')}`, '', '## Runs', '');
  lines.push('| case | run | options | shapes | duplicateShare | originality | fit | strong | rare | recommendedShape | recommendedOriginality | recommendedFit | tokens | costUsd |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of records) lines.push(`| ${r.case} | ${r.run} | ${r.options} | ${r.shapes} | ${fixed(r.duplicateShare)} | ${fixed(r.originality)} | ${fixed(r.fit)} | ${r.strong} | ${fixed(r.rare)} | ${r.recommendedShape ?? 'n/a'} | ${fixed(r.recommendedOriginality)} | ${fixed(r.recommendedFit)} | ${fixed(r.tokens)} | ${fixed(r.costUsd)} |`);
  return `${lines.join('\n')}\n`;
}

export function compareMarkdown({ left, right }) {
  const lines = ['| metric | diff | two SE | verdict |', '| --- | --- | --- | --- |'];
  for (const metric of METRICS) {
    const pick = (records) => records.map((record) => record[metric]).filter((value) => value !== null && value !== undefined);
    const result = compareMeans(pick(left), pick(right));
    lines.push(`| ${metric} | ${fixed(result.diff)} | ${fixed(result.twoSeDiff)} | ${result.verdict} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function scoreCase({ judge, caseId, runs }) {
  const extracted = [];
  const unscored = [];
  for (const run of runs) {
    const got = await extractRun({ judge, finalText: run.finalText });
    if (got.failed) unscored.push(`${caseId}/${run.run} extract`);
    extracted.push({ run: run.run, tokens: run.tokens ?? null, costUsd: run.costUsd ?? null, ...got });
  }
  const pooled = extracted.flatMap((entry) => entry.options.map((option) => ({ ...option, run: entry.run })));
  const shapes = pooled.length === 0 ? [] : await clusterOptions({ judge, options: pooled });
  if (shapes === null) throw new Error(`cluster failed for case ${caseId}, no repair loop`);
  return { extracted, pooled, shapes, unscored };
}

async function scoreQueue({ judge, caseId, spec, pooled }) {
  const queue = shuffled([...pooled.map((option) => ({ option })), ...spec.controls.map((key) => ({ option: key, key }))]);
  const controls = [];
  const unscored = [];
  for (const item of queue) {
    const got = await scoreOption({ judge, problem: spec.feature, option: item.option });
    if (item.key) controls.push({ key: item.key, got });
    else item.option.scores = got ?? undefined;
    if (got === null) unscored.push(`${caseId}/${item.option.title}`);
  }
  return { controls, unscored };
}

export async function scoreArm({ judge, cases, runsByCase }) {
  const records = [];
  const caseShares = {};
  const controls = [];
  const unscored = [];
  for (const [caseId, runs] of Object.entries(runsByCase)) {
    const spec = cases[caseId];
    const done = await scoreCase({ judge, caseId, runs });
    unscored.push(...done.unscored);
    const queued = await scoreQueue({ judge, caseId, spec, pooled: done.pooled });
    controls.push(...queued.controls);
    unscored.push(...queued.unscored);
    const caseRecords = recordsOf({ caseId, done });
    records.push(...caseRecords);
    caseShares[caseId] = modalShare({ records: caseRecords });
  }
  return { records, caseShares, verdict: calibration(controls), unscored };
}

function recordsOf({ caseId, done }) {
  let offset = 0;
  const made = done.extracted.map((entry) => {
    const own = done.pooled.slice(offset, offset + entry.options.length);
    const shapes = done.shapes.slice(offset, offset + entry.options.length);
    offset += entry.options.length;
    const recommended = entry.recommended;
    return runRecord({ caseId, run: entry.run, options: own, shapes, recommended, tokens: entry.tokens, costUsd: entry.costUsd });
  });
  return addRarity(made);
}
