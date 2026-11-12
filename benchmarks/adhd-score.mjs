#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { commonDir } from '#checkout';
import { makeCellHome } from './cell-home.mjs';
import { BREVITY_LINES, withoutSentence } from './tasks.mjs';
import { gateReply } from './adhd/gates.mjs';
import { calibrationLines } from './judge-calibration.mjs';
import { DEFAULT_JUDGE_MODEL, JUDGE_CONCURRENCY, JUDGE_VOTES, callStats, calibrate, claudeJudge, judgeStability, judgeVote, missingFacts, requireCost, spawnClaude } from './adhd/judges.mjs';
import { judgeStatusLines, quickPowerLine } from './adhd/quick-report.mjs';
import { rescoreQuick } from './adhd/rescore-quick.mjs';
import { Spend } from './adhd/spend.mjs';
import { assertBaseStyle, assertConciseCovers, baseLines, quickCaseLine, summaryLine, summaryOf } from './adhd/paired.mjs';
import { buildFailRows } from './adhd/labels.mjs';
import { quickMaxUsd } from './adhd/metrics.mjs';
import { writeAtomic } from '../lib/basics.mjs';
import { clusteredMeanCi, meanCi, median } from '../lib/eval-stats.mjs';
import { intervalText } from './interval-text.mjs';
import { plannedPowerLine } from './power-plan.mjs';
import { mean, readJson } from './basics.mjs';

export { Spend };

const ROOT = path.join(import.meta.dirname, '..');
const CASES = path.join(import.meta.dirname, 'adhd', 'cases.jsonl');
const SATURATED = path.join(import.meta.dirname, 'adhd', 'saturated.json');
const QUICK = path.join(import.meta.dirname, 'adhd', 'quick.json');
const CAVEMAN = path.join(import.meta.dirname, 'adhd', 'arms', 'caveman.md');
// why: the baseline and labels are gitignored, so inside the checkout every new worktree lacks them and removing one deletes them; the git common dir is shared by all worktrees and never committed.
const STORE = path.join(commonDir(ROOT), 'exo', 'adhd');
const BASELINE = path.join(STORE, 'baseline.json');
const CONCISE = path.join(STORE, 'concise.json');
const LOG_DIR = path.join(ROOT, '.exo', 'adhd-score');
const LABELS = path.join(STORE, 'labels.jsonl');
const LABELS_TO_WRITE = 5;
export { callStats };
export const REPLY_MODEL = 'claude-opus-5-5';
const RUNS = 3;
export const ADHD_RUNS = 3;
const CONCURRENCY = 8;
export const SCORE_MAX_USD = 3;
const FAIL_SOURCE_LOGS = 3;
const STABILITY_REPEATS = 5;
const BASELINE_MAX_USD = 4;

export const readCases = (file = CASES) =>
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));

export const readSaturated = (file = SATURATED) => readJson(file);

export const readQuick = (file = QUICK) => readJson(file);

export function selectCases(cases, { screen, caseIds }, saturated = readSaturated()) {
  const unknown = (caseIds ?? []).find((id) => !cases.some((c) => c.id === id));
  if (unknown) throw new Error(`unknown case: ${unknown}`);
  return cases.filter((c) => (!caseIds || caseIds.includes(c.id)) && !(screen && saturated.includes(c.id)));
}


// why: `output_tokens` bills thinking too (a 20-word reply logged 186), so length is what the reader sees: each word or number and each punctuation mark counts 1. Local, deterministic, same counter for both arms.
export const visibleTokens = (text) => (String(text).match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []).length;
const meanVisible = (replies) => mean(replies.map(visibleTokens));
const promptOf = (c) => `${c.context}\n\n${c.question}`;

// why: the adhd arm differs from the default arm only by this plugin dir holding the style file.
export function makeStylePlugin(ablate = null, style = fs.readFileSync(path.join(ROOT, 'output-styles', 'adhd.md'), 'utf8')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-plugin-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'));
  fs.mkdirSync(path.join(dir, 'output-styles'));
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'exo', version: '0.0.0', description: 'adhd style only' }));
  fs.writeFileSync(path.join(dir, 'output-styles', 'adhd.md'), ablate === null ? style : withoutSentence(style, BREVITY_LINES[ablate]));
  return dir;
}

const CONCISE_PROMPT = 'Answer concisely.';

const ARM_ARGS = {
  default: () => [],
  concise: () => ['--append-system-prompt', CONCISE_PROMPT],
  caveman: () => ['--append-system-prompt', `${CONCISE_PROMPT}\n\n${fs.readFileSync(CAVEMAN, 'utf8').trim()}`],
  adhd: (pluginDir) => ['--plugin-dir', pluginDir, '--settings', JSON.stringify({ outputStyle: 'exo:adhd' })],
};

// why: one real `claude -p` in a clean HOME and the arm's fixed empty cwd, so every call shares one system-prompt prefix; a fresh HOME per call put a per-call value in that prefix and each call rewrote ~2.1k cache tokens. Tokens and cost come from its JSON result.
export function claudeReply({ arm, prompt, model = REPLY_MODEL, pluginDir, cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-case-')), keepCwd = false, home: fixedHome }) {
  const home = fixedHome ?? makeCellHome();
  const armArgs = ARM_ARGS[arm];
  if (!armArgs) throw new Error(`unknown arm ${arm}`);
  const args = ['-p', '--model', model, '--tools', '', '--output-format', 'json', '--setting-sources', 'project,local', '--strict-mcp-config', '--disable-slash-commands', '--exclude-dynamic-system-prompt-sections', ...armArgs(pluginDir)];
  return spawnClaude({ args, input: prompt, cwd, home })
    .then((out) => {
      const json = JSON.parse(out);
      return { text: json.result, tokens: json.usage.output_tokens, cost: requireCost(json.total_cost_usd), usage: json.usage };
    })
    .finally(() => {
      if (!keepCwd) fs.rmSync(cwd, { recursive: true, force: true });
      if (!fixedHome) fs.rmSync(home, { recursive: true, force: true });
    });
}

// why: the first call per key runs alone so it writes the prompt cache; later calls read it instead of each writing their own.
export function makeStager() {
  const warmed = new Set();
  return async (key, count, task) => {
    const results = [];
    if (!warmed.has(key) && count > 0) {
      warmed.add(key);
      results.push(await task(0));
    }
    const rest = await Promise.all(Array.from({ length: count - results.length }, (_, i) => task(results.length + i)));
    return [...results, ...rest];
  };
}

// why: a baseline run costs real money and one hung call must not lose finished cases, so existing rows are kept unless `all`, `save` runs after each case, and a failed call names its case and arm; with a `model`, rows carry it and a row from another model counts as missing.
export async function buildBaseline({ cases, reply, spend, runs = RUNS, existing = {}, all = false, save = () => {}, arm = 'default', model }) {
  const stage = makeStager();
  const baseline = all ? {} : { ...existing };
  for (const c of cases) {
    if (baseline[c.id] && (!model || baseline[c.id].model === model)) continue;
    const results = await stage(arm, runs, () => Promise.resolve(reply({ arm, prompt: promptOf(c) })).catch((error) => {
      throw new Error(`reply failed for case ${c.id}, arm ${arm}: ${error.message}`, { cause: error });
    }));
    results.forEach((r) => spend.add(r.cost));
    baseline[c.id] = { replies: results.map((r) => r.text), tokens: results.map((r) => r.tokens), mean: mean(results.map((r) => r.tokens)), cost: results.reduce((sum, r) => sum + r.cost, 0), ...(model ? { model } : {}) };
    save(baseline);
  }
  return baseline;
}

// why: judge only replies that passed their gates, each reply in its own calls; the majority of JUDGE_VOTES calls per fact gives the facts it misses.
const judgeMissing = ({ c, texts, judge, judgeModel, spend }) =>
  Promise.all(texts.map(async (reply) => missingFacts(await judgeVote({ reply, question: c.question, facts: c.facts, judge, model: judgeModel, onCost: (cost) => spend.add(cost, 'judge') }))));

// why: a run that misses m of n facts moves from its length ratio r toward the failure anchor F = max(1, r) by m/n, so one missed fact of four costs a quarter of the way instead of the whole; a gate failure scores F, and F >= r keeps any failing run from beating a complete one.
export function runRatio({ ratio, gateFailed, missing, factCount }) {
  const anchor = Math.max(1, ratio);
  if (gateFailed) return anchor;
  return ratio + ((anchor - ratio) * missing) / Math.max(1, factCount);
}

async function scoreCase({ c, results, baseline, judge, judgeModel, spend }) {
  const failed = results.map((r) => gateReply(r.text, c).failed);
  const missing = results.map(() => []);
  const passing = failed.flatMap((f, i) => (f.length === 0 ? [i] : []));
  if (passing.length > 0) {
    const judged = await judgeMissing({ c, texts: passing.map((i) => results[i].text), judge, judgeModel, spend });
    passing.forEach((i, k) => {
      missing[i] = judged[k];
      if (judged[k].length > 0) failed[i] = ['judge:facts'];
    });
  }
  const baselineVisible = meanVisible(baseline[c.id].replies);
  const runs = results.map((r, i) => {
    const visible = visibleTokens(r.text);
    const gateFailed = failed[i].some((f) => !f.startsWith('judge:'));
    const ratio = runRatio({ ratio: visible / baselineVisible, gateFailed, missing: missing[i].length, factCount: c.facts.length });
    return { visible, tokens: r.tokens, ratio, failed: failed[i], missingFacts: missing[i].map((k) => c.facts[k]), missing: missing[i] };
  });
  return {
    id: c.id, replies: results.map((r) => r.text), visibleTokens: mean(runs.map((r) => r.visible)), baselineVisible,
    tokens: mean(results.map((r) => r.tokens)), baselineTokens: baseline[c.id].mean,
    failed: [...new Set(failed.flat())], ratio: mean(runs.map((r) => r.ratio)), runs,
  };
}

// why: each reply now has its own judge calls, so a shared cap keeps the calls in flight at the old 8 cases × 3 votes.
function limited(task, max) {
  let active = 0;
  const waiting = [];
  const release = () => { active -= 1; if (waiting.length > 0) waiting.shift()(); };
  return async (...args) => {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try { return await task(...args); } finally { release(); }
  };
}

function assertProjection({ spend, doneUsd, done, total }) {
  const projected = (doneUsd / done) * total;
  if (projected <= spend.maxUsd) return;
  throw new Error(`projected_usd=${projected.toFixed(4)} over --max-usd ${spend.maxUsd}`);
}

function assertBaselineCovers(cases, baseline) {
  const missing = cases.filter((c) => !baseline[c.id]).map((c) => c.id);
  if (missing.length > 0) throw new Error(`baseline lacks cases: ${missing.join(', ')}; run with --baseline`);
}

function caseScorer({ baseline, reply, judge, judgeModel, spend, runs, stage }) {
  return async (c) => {
    const results = await stage('adhd', runs, () => reply({ arm: 'adhd', prompt: promptOf(c) }));
    results.forEach((r) => spend.add(r.cost));
    let caseUsd = results.reduce((sum, r) => sum + r.cost, 0);
    const caseSpend = { add: (cost, kind) => { caseUsd += cost; spend.add(cost, kind); } };
    return { ...(await scoreCase({ c, results, baseline, judge, judgeModel, spend: caseSpend })), cost_usd: caseUsd };
  };
}

function caseWorker({ cases, todo, perCase, scoreOne, spend, onCase }) {
  let next = 0;
  let done = 0;
  let doneUsd = 0;
  return async () => {
    while (next < todo.length) {
      const i = todo[next++];
      perCase[i] = await scoreOne(cases[i]);
      onCase(perCase.filter(Boolean));
      done += 1;
      doneUsd += perCase[i].cost_usd;
      // why: the mean cost of the completed cases prices the whole run, not total spend, which already holds the replies of cases still in flight; checking after every case catches later cases that cost more than the first.
      assertProjection({ spend, doneUsd, done, total: todo.length });
    }
  };
}

// why: a fixed ADHD_RUNS default keeps every improve round on the same footing.
export async function scoreCases({ cases, baseline, reply, judge = claudeJudge, judgeModel, spend, runs = ADHD_RUNS, prior = [], onCase = () => {} }) {
  assertBaselineCovers(cases, baseline);
  process.stderr.write(`runs=${runs}\n`);
  const kept = new Map(prior.map((p) => [p.id, p]));
  const perCase = cases.map((c) => kept.get(c.id));
  const todo = cases.flatMap((c, i) => (kept.has(c.id) ? [] : [i]));
  const scoreOne = caseScorer({ baseline, reply, judge: limited(judge, JUDGE_CONCURRENCY), judgeModel, spend, runs, stage: makeStager() });
  const worker = caseWorker({ cases, todo, perCase, scoreOne, spend, onCase });
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return summarize(perCase, runs);
}

function summarize(perCase, runs) {
  const allRuns = perCase.flatMap((p) => p.runs);
  const passing = allRuns.filter((r) => r.failed.length === 0);
  const passRate = passing.length / allRuns.length;
  const passRatio = passing.length > 0 ? mean(passing.map((r) => r.ratio)) : null;
  const billedTokens = perCase.reduce((sum, p) => sum + p.tokens, 0);
  const baselineBilledTokens = perCase.reduce((sum, p) => sum + p.baselineTokens, 0);
  const scoreCi = clusteredMeanCi(perCase.flatMap((p) => p.runs.map((r) => ({ cluster: p.id, value: r.ratio }))));
  return { score: mean(perCase.map((p) => p.ratio)), scoreSe: scoreCi.se, scoreLo: scoreCi.lo, scoreHi: scoreCi.hi, passRate, passRatio, billedTokens, baselineBilledTokens, perCase, runs };
}

export function baselineVerdict({ lo, hi }) {
  if (lo === null || hi === null) return 'no SE';
  if (hi < 1) return 'shorter';
  if (lo > 1) return 'longer';
  return 'noise';
}

export function scoreIntervalLine(result) {
  const clusters = result.perCase.length;
  if (result.scoreSe === null) return `score_se=none score_ci95=none clusters=${clusters} vs_baseline=no SE\n`;
  return `score_se=${result.scoreSe.toFixed(3)} score_ci95=${result.scoreLo.toFixed(3)}..${result.scoreHi.toFixed(3)} clusters=${clusters} vs_baseline=${baselineVerdict({ lo: result.scoreLo, hi: result.scoreHi })}\n`;
}

export async function rescoreCases({ cases, baseline, log, judge = claudeJudge, judgeModel, spend }) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const rows = log.perCase.filter((p) => byId.has(p.id));
  if (rows.length === 0 || rows.some((p) => !p.replies?.length)) throw new Error('the log holds no replies to rescore for these cases');
  assertBaselineCovers(rows, baseline);
  const judgeCall = limited(judge, JUDGE_CONCURRENCY);
  const perCase = await Promise.all(rows.map(async (p) => {
    let caseUsd = 0;
    const caseSpend = { add: (cost, kind) => { caseUsd += cost; spend.add(cost, kind); } };
    const results = p.replies.map((text) => ({ text, tokens: p.tokens }));
    const scored = await scoreCase({ c: byId.get(p.id), results, baseline, judge: judgeCall, judgeModel, spend: caseSpend });
    return { ...scored, tokens: p.tokens, baselineTokens: p.baselineTokens, cost_usd: caseUsd };
  }));
  return summarize(perCase, log.runs);
}

export function projectDryRun({ cases, baseline, runs, judgePerReply = null }) {
  assertBaselineCovers(cases, baseline);
  const replyPerRun = (c) => baseline[c.id].cost / baseline[c.id].replies.length;
  const costPerRun = (c) => replyPerRun(c) + (judgePerReply ?? 0.4 * replyPerRun(c));
  const projectedUsd = cases.reduce((sum, c) => sum + costPerRun(c) * runs, 0);
  return { cells: cases.length * runs, projectedUsd, judgeCost: judgePerReply === null ? 'assumed 0.4 x reply cost' : 'recorded' };
}

// why: --check proves the committed baseline matches the cases with zero API calls; `tokens` and `mean` stay billed output tokens for cost reference, the ratio reads `replies`.
export function checkBaseline({ cases, baseline, runs = RUNS }) {
  const problems = [];
  for (const c of cases) {
    const b = baseline[c.id];
    if (!b) { problems.push(`${c.id}: missing from baseline`); continue; }
    if (!Array.isArray(b.tokens) || b.tokens.length !== runs) problems.push(`${c.id}: needs ${runs} token counts`);
    if (!Array.isArray(b.replies) || b.replies.length !== runs) problems.push(`${c.id}: needs ${runs} replies`);
    if (Array.isArray(b.replies) && b.replies.length > 0 && meanVisible(b.replies) === 0) problems.push(`${c.id}: baseline replies have no visible text`);
    if (Array.isArray(b.tokens) && b.tokens.length > 0 && Math.abs(mean(b.tokens) - b.mean) > 1e-9) problems.push(`${c.id}: mean ${b.mean} != ${mean(b.tokens)}`);
  }
  return problems;
}

// why: labels mix default and adhd replies, interleaved so both arms are in the first rows.
export function buildLabelRows({ cases, baseline, adhdReplies = {} }) {
  const pool = [];
  for (const c of cases) {
    const arms = [['default', baseline[c.id]?.replies ?? []], ['adhd', adhdReplies[c.id] ?? []]];
    arms.forEach(([arm, replies]) => replies.forEach((reply, n) => pool.push({ id: `${c.id}-${arm}-${n}`, question: c.question, facts: c.facts, reply, arm })));
  }
  const byArm = (arm) => pool.filter((p) => p.arm === arm);
  const mixed = [];
  for (let i = 0; i < Math.max(byArm('default').length, byArm('adhd').length); i += 1) mixed.push(byArm('default')[i], byArm('adhd')[i]);
  const items = mixed.filter(Boolean);
  if (items.length < LABELS_TO_WRITE) throw new Error(`need ${LABELS_TO_WRITE} stored replies to label, have ${items.length}`);
  return items.slice(0, LABELS_TO_WRITE).map((item) => ({ id: item.id, dimension: 'facts', question: item.question, facts: item.facts, reply: item.reply, label: null }));
}

export const readLabels = (file = LABELS) =>
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.label === 'PASS' || row.label === 'FAIL');

const ratio = ({ agree, total }) => `${agree}/${total}`;

// why: agreement on PASS rows and on FAIL rows apart, so an always-PASS or always-FAIL judge cannot hide behind a lopsided label set.
export async function calibrateLines({ labels, judge, model, onCost, votes }) {
  const r = await calibrate({ labels, judge, model, onCost, votes });
  return [`facts ${ratio(r)} pass_rows=${ratio(r.pass)} fail_rows=${ratio(r.fail)} built_fail_rows=${ratio(r.built)} deleted_fact_only=${ratio(r.deleted)}`];
}

// why: a partial log and a quick-run log hold no full-run replies, so the readers that expect full-run data skip both.
function isSkippedLog(file) {
  try {
    const log = readJson(file);
    return log.partial === true || log.mode === 'quick';
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

const logFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !isSkippedLog(path.join(dir, f))).sort() : []);

// why: rows are rebuilt from the human labels and the newest score logs, so the same inputs give the same rows; a row id already in the file is never written again, and no existing line changes.
export function runAddFailLabels(cases, { file = LABELS, logDir = LOG_DIR, baseline = readBaseline() } = {}) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing; run with --to-label and label it first`);
  const existing = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const logs = logFiles(logDir).slice(-FAIL_SOURCE_LOGS).map((name) => ({ name, log: readJson(path.join(logDir, name)) }));
  const ids = new Set(existing.map((row) => `${row.dimension}:${row.id}`));
  const rows = buildFailRows({ passRows: existing, logs, cases, baseline }).filter((row) => !ids.has(`${row.dimension}:${row.id}`));
  if (rows.length > 0) fs.appendFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  process.stdout.write(`appended ${rows.length} known-FAIL facts rows to ${file} from ${logs.length} logs in ${logDir}\n`);
  return rows;
}

// why: the stability check judges what scoring judges: each reply that passed its gates, alone.
export function stabilityItems(cases, log) {
  const byCase = new Map(cases.map((c) => [c.id, c]));
  return (log.perCase ?? []).flatMap((p) => {
    const c = byCase.get(p.id);
    if (!c) return [];
    return (p.replies ?? []).flatMap((reply, n) => (gateReply(reply, c).failed.length === 0 ? [{ id: `${p.id}#${n}`, question: c.question, facts: c.facts, reply }] : []));
  });
}

function latestAdhdReplies() {
  const logs = logFiles(LOG_DIR);
  if (logs.length === 0) return {};
  const { perCase = [] } = readJson(path.join(LOG_DIR, logs.at(-1)));
  return Object.fromEntries(perCase.filter((p) => p.replies).map((p) => [p.id, p.replies]));
}

const FLAGS = { '--full': 'full', '--baseline': 'baseline', '--concise-baseline': 'conciseBaseline', '--check': 'check', '--to-label': 'toLabel', '--calibrate': 'calibrate', '--add-fail-labels': 'addFailLabels', '--stability': 'stability', '--all': 'all', '--dry-run': 'dryRun', '--screen': 'screen', '--rescore': 'rescore' };
const VALUES = { '--runs': ['runs', Number], '--max-usd': ['maxUsd', Number], '--judge-model': ['judgeModel', String], '--model': ['model', String], '--log-dir': ['logDir', String], '--log': ['log', String], '--resume': ['resume', String], '--repeats': ['repeats', Number], '--votes': ['votes', Number], '--ablate': ['ablate', String], '--cases': ['caseIds', (value) => value.split(',')], '--arm': ['arm', String], '--answers': ['answers', Number], '--base-style': ['baseStyle', String] };
const FULL_RUN_FLAGS = ['--full', '--screen', '--baseline', '--rescore', '--resume', '--runs'];
const OTHER_ACTIONS = ['check', 'dryRun', 'toLabel', 'calibrate', 'addFailLabels', 'stability', 'conciseBaseline'];
const QUICK_ARMS = ['adhd', 'caveman'];

function defaultMaxUsd(building, { mode, caseIds, answers, baseStyle }) {
  if (building) return BASELINE_MAX_USD;
  return mode === 'quick' ? quickMaxUsd(caseIds ?? readQuick()) * answers * (baseStyle ? 2 : 1) : SCORE_MAX_USD;
}

export function parseArgs(argv) {
  const opts = { toLabel: false, calibrate: false, addFailLabels: false, stability: false, baseline: false, conciseBaseline: false, all: false, dryRun: false, check: false, runs: ADHD_RUNS, maxUsd: null, judgeModel: DEFAULT_JUDGE_MODEL, model: REPLY_MODEL, logDir: LOG_DIR, log: null, repeats: STABILITY_REPEATS, votes: JUDGE_VOTES, ablate: null, screen: false, rescore: false, full: false, arm: 'adhd', caseIds: null, resume: null, answers: 1, baseStyle: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (FLAGS[argv[i]]) opts[FLAGS[argv[i]]] = true;
    else if (VALUES[argv[i]]) { const [key, cast] = VALUES[argv[i]]; opts[key] = cast(argv[++i]); }
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (opts.ablate !== null && !Object.hasOwn(BREVITY_LINES, opts.ablate)) throw new Error(`--ablate needs one of: ${Object.keys(BREVITY_LINES).join(', ')}`);
  if (opts.baseline && opts.conciseBaseline) throw new Error('--baseline cannot combine with --concise-baseline');
  const building = opts.baseline || opts.conciseBaseline;
  if (opts.all && !building) throw new Error('--all needs --baseline or --concise-baseline');
  if (opts.rescore && (building || opts.dryRun)) throw new Error('--rescore cannot combine with --baseline or --dry-run');
  if (opts.rescore && !opts.log) throw new Error('--rescore needs --log <file>');
  if (opts.resume && (building || opts.dryRun || opts.rescore)) throw new Error('--resume cannot combine with --baseline, --dry-run or --rescore');
  if (opts.screen && !argv.includes('--runs')) opts.runs = 1;
  opts.mode = FULL_RUN_FLAGS.some((flag) => argv.includes(flag)) || OTHER_ACTIONS.some((key) => opts[key]) ? 'full' : 'quick';
  if (!QUICK_ARMS.includes(opts.arm)) throw new Error(`--arm needs one of: ${QUICK_ARMS.join(', ')}`);
  if (argv.includes('--arm') && opts.mode !== 'quick') throw new Error('--arm cannot combine with a full-run flag');
  if (opts.ablate !== null && opts.arm === 'caveman') throw new Error('--ablate cannot combine with --arm caveman');
  if (argv.includes('--answers') && opts.mode !== 'quick') throw new Error('--answers cannot combine with a full-run flag');
  if (!Number.isInteger(opts.answers) || opts.answers < 1) throw new Error('--answers needs an integer of at least 1');
  if (opts.baseStyle !== null) assertBaseStyle(argv, opts);
  if (opts.maxUsd === null) opts.maxUsd = defaultMaxUsd(building, opts);
  if (!Number.isFinite(opts.maxUsd)) throw new Error('--max-usd needs a number');
  if (!Number.isInteger(opts.runs) || opts.runs < 1) throw new Error('--runs needs a positive integer');
  if (!Number.isInteger(opts.repeats) || opts.repeats < 2) throw new Error('--repeats needs an integer of at least 2');
  return opts;
}

const logPath = (dir) => path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

function writeLog(record, file) {
  writeAtomic(file, JSON.stringify(record, null, 2));
}

const readBaseline = () => {
  if (!fs.existsSync(BASELINE)) throw new Error(`${BASELINE} is missing; run with --baseline`);
  return readJson(BASELINE);
};

function runCheck(cases) {
  const problems = checkBaseline({ cases, baseline: readBaseline() });
  if (problems.length > 0) throw new Error(`baseline check failed:\n${problems.join('\n')}`);
  process.stdout.write(`baseline ok: ${cases.length} cases\n`);
}

export function judgeRate(dir) {
  const [newest] = logFiles(dir).reverse();
  if (!newest) return null;
  const log = readJson(path.join(dir, newest));
  const replies = (log.perCase ?? []).reduce((sum, p) => sum + (p.replies?.length ?? 0), 0);
  return replies > 0 && Number.isFinite(log.judge_cost_usd) ? log.judge_cost_usd / replies : null;
}

export function runDryRun(opts, cases, baseline = readBaseline()) {
  const out = projectDryRun({ cases, baseline, runs: opts.runs, judgePerReply: judgeRate(opts.logDir) });
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.stderr.write(`${plannedPowerLine({ tasks: cases.length, samples: opts.runs })}\n`);
  if (out.projectedUsd > opts.maxUsd) process.stderr.write(`projected_usd=${out.projectedUsd.toFixed(4)} over --max-usd ${opts.maxUsd}\n`);
}

export function runToLabel(cases, { file = LABELS, baseline = readBaseline() } = {}) {
  if (fs.existsSync(file) && readLabels(file).length > 0) throw new Error(`${file} already labelled; move it aside before --to-label`);
  const rows = buildLabelRows({ cases, baseline, adhdReplies: latestAdhdReplies() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  process.stdout.write(`wrote ${rows.length} rows to ${file}; set each label to PASS or FAIL\n`);
}

// why: one HOME and cwd for every judge call keeps the system-prompt prefix fixed, so calls after the first read the cache.
async function withJudge(opts, task) {
  const spend = new Spend(opts.maxUsd);
  const judgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-judge-'));
  const judgeHome = makeCellHome();
  const judge = (call) => claudeJudge({ ...call, cwd: judgeDir, home: judgeHome });
  try {
    await task({ judge, onCost: (cost) => spend.add(cost, 'judge'), spend });
  } finally {
    process.stderr.write(`${spend.line().trimEnd()} call_timeouts=${callStats.timeouts} parse_retries=${callStats.parseRetries} dropped_votes=${callStats.droppedVotes}\n`);
    for (const dir of [judgeDir, judgeHome]) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function runCalibrate(opts) {
  if (!fs.existsSync(LABELS)) throw new Error(`${LABELS} is missing; run with --to-label`);
  await withJudge(opts, async ({ judge, onCost }) => {
    process.stdout.write(`${(await calibrateLines({ labels: readLabels(), judge, model: opts.judgeModel, onCost, votes: opts.votes })).join('\n')}\n`);
  });
}

async function runStability(opts, cases) {
  const file = opts.log ?? (logFiles(opts.logDir).length > 0 ? path.join(opts.logDir, logFiles(opts.logDir).at(-1)) : null);
  if (!file) throw new Error(`no score log in ${opts.logDir}; pass --log <file>`);
  const items = stabilityItems(cases, readJson(file));
  process.stderr.write(`stability log=${file} replies=${items.length} repeats=${opts.repeats} votes=${opts.votes}\n`);
  await withJudge(opts, async ({ judge, onCost }) => {
    const r = await judgeStability({ items, repeats: opts.repeats, judge, model: opts.judgeModel, onCost, votes: opts.votes });
    process.stdout.write(`facts flipped=${r.flipped}/${r.replies} flip_rate=${r.flipRate.toFixed(3)} minority_share=${r.minorityShare.toFixed(3)} fact_flipped=${r.factsFlipped}/${r.facts} fact_flip_rate=${r.factFlipRate.toFixed(3)}\n`);
  });
}

// why: fact numbers per run (1-based) on stderr; the JSON log keeps the fact texts in runs[].missingFacts.
const missingLine = (p) => {
  const parts = p.runs.flatMap((r, n) => (r.missing.length > 0 ? [`run${n + 1}:${r.missing.map((k) => k + 1).join(',')}`] : []));
  return parts.length > 0 ? ` missing=${parts.join(' ')}` : '';
};

export const caseLine = (p) => `${p.id} ratio=${p.ratio.toFixed(3)} visible=${Math.round(p.visibleTokens)}/${Math.round(p.baselineVisible)} billed=${Math.round(p.tokens)}/${Math.round(p.baselineTokens)} failed=${p.failed.join(',') || 'none'}${missingLine(p)}\n`;

function reportScore({ result, record, file }) {
  for (const p of result.perCase) process.stderr.write(caseLine(p));
  writeLog({ ...result, ...record }, file);
  process.stderr.write(scoreIntervalLine(result));
  process.stderr.write(`${calibrationLines(['adhd-facts']).join('\n')}\n`);
  process.stderr.write(`pass_rate=${result.passRate.toFixed(3)} pass_ratio=${result.passRatio === null ? 'n/a' : result.passRatio.toFixed(3)}\n`);
  process.stderr.write(`billed_tokens=${Math.round(result.billedTokens)} baseline_billed_tokens=${Math.round(result.baselineBilledTokens)}\n`);
  process.stdout.write(`${result.score.toFixed(3)}\n`);
}

const costRecord = (spend, before = {}) => ({ cost_usd: spend.total + (before.cost_usd ?? 0), reply_cost_usd: spend.reply + (before.reply_cost_usd ?? 0), judge_cost_usd: spend.judge + (before.judge_cost_usd ?? 0) });

function readPartialLog(opts, cases) {
  const log = readJson(opts.resume);
  if (log.partial !== true) throw new Error(`${opts.resume} is not a partial log`);
  if (log.runs !== opts.runs || (log.ablate ?? null) !== opts.ablate || (log.screen ?? false) !== opts.screen || log.model !== opts.model || JSON.stringify(log.cases) !== JSON.stringify(cases.map((c) => c.id))) throw new Error(`${opts.resume} was made with other --runs, --ablate, --screen, --model or --cases`);
  return log;
}

export async function runScore({ opts, cases, reply, judge, spend, baseline = readBaseline() }) {
  const started = Date.now();
  const before = opts.resume ? readPartialLog(opts, cases) : null;
  const file = logPath(opts.logDir);
  const record = () => ({ durationMs: (before?.durationMs ?? 0) + Date.now() - started, ablate: opts.ablate, screen: opts.screen, model: opts.model, cases: cases.map((c) => c.id), ...costRecord(spend, before ?? undefined) });
  const onCase = (rows) => writeLog({ ...summarize(rows, opts.runs), ...record(), partial: true }, file);
  const result = await scoreCases({ cases, baseline, reply, judge, judgeModel: opts.judgeModel, spend, runs: opts.runs, prior: before?.perCase ?? [], onCase });
  reportScore({ result, file, record: record() });
}

export async function runRescore({ opts, cases, judge, spend, baseline = readBaseline() }) {
  const started = Date.now();
  const log = readJson(opts.log);
  if (log.partial === true) throw new Error(`${opts.log} is a partial log; finish it with --resume first`);
  if (log.mode === 'quick') {
    const judgeCall = limited(judge, JUDGE_CONCURRENCY);
    const judgeOne = async (c, text) => (await judgeMissing({ c, texts: [text], judge: judgeCall, judgeModel: opts.judgeModel, spend }))[0];
    const record = await rescoreQuick({ log, cases, file: opts.log, maxUsd: opts.maxUsd, judgeOne });
    writeLog({ ...record, ...costRecord(spend), durationMs: Date.now() - started }, logPath(opts.logDir));
    return printQuick(record);
  }
  const result = await rescoreCases({ cases, baseline, log, judge, judgeModel: opts.judgeModel, spend });
  reportScore({ result, file: logPath(opts.logDir), record: { durationMs: Date.now() - started, ablate: log.ablate ?? null, screen: opts.screen || (log.screen ?? false), cases: result.perCase.map((p) => p.id), rescoredFrom: opts.log, ...costRecord(spend) } });
}

export const concisePath = (model) => (model === REPLY_MODEL ? CONCISE : path.join(STORE, `concise.${model}.json`));

const readConcise = (model) => {
  const file = concisePath(model);
  if (!fs.existsSync(file)) throw new Error(`${file} is missing; run with --concise-baseline --model ${model}`);
  return readJson(file);
};

// why: the facts judge reads only replies that pass the literals gate, so a missing literal never costs a judge call; each case makes one reply, the first alone to write the prompt cache, then the rest together.
async function quickRows({ opts, cases, reply, judge, spend, concise }) {
  const judgeCall = limited(judge, JUDGE_CONCURRENCY);
  const rowOf = async (c, answer, side) => {
    const failed = gateReply(answer.text, c).failed;
    const [missing = []] = failed.includes('literals') ? [] : await judgeMissing({ c, texts: [answer.text], judge: judgeCall, judgeModel: opts.judgeModel, spend });
    const baselineVisible = meanVisible(concise[c.id].replies);
    const visible = visibleTokens(answer.text);
    return { testCase: c, reply: answer.text, tokens: answer.tokens, baselineTokens: concise[c.id].mean, visible, baselineVisible, billedRatio: answer.tokens / concise[c.id].mean, ratio: visible / baselineVisible, missing, side };
  };
  const ask = ({ c, side }) => Promise.resolve(reply({ arm: opts.arm, prompt: promptOf(c), side })).then((answer) => {
    spend.add(answer.cost);
    return rowOf(c, answer, side);
  });
  const sides = opts.baseStyle ? ['candidate', 'base'] : ['candidate'];
  const jobs = sides.flatMap((side) => cases.flatMap((c) => Array.from({ length: opts.answers }, () => ({ c, side }))));
  const leaders = sides.map((side) => jobs.find((job) => job.side === side));
  const rest = jobs.filter((job) => !leaders.includes(job));
  const leading = [];
  for (const job of leaders) {
    const answer = await reply({ arm: opts.arm, prompt: promptOf(job.c), side: job.side });
    spend.add(answer.cost);
    leading.push({ job, answer });
  }
  assertProjection({ spend, doneUsd: leading.reduce((sum, { answer }) => sum + answer.cost, 0), done: leaders.length, total: jobs.length });
  return Promise.all([...leading.map(({ job, answer }) => rowOf(job.c, answer, job.side)), ...rest.map(ask)]);
}

export async function runQuick({ opts, cases, reply, judge, spend, concise = readConcise(opts.model) }) {
  const started = Date.now();
  assertConciseCovers(cases, concise, opts.model);
  const base = { mode: 'quick', arm: opts.arm, answers: opts.answers, ablate: opts.ablate, model: opts.model, cases: cases.map((c) => c.id) };
  const rows = await quickRows({ opts, cases, reply, judge, spend, concise }).catch((error) => {
    writeLog({ ...base, ...(opts.baseStyle ? { baseStyle: opts.baseStyle } : {}), error: error.message, ...costRecord(spend), durationMs: Date.now() - started }, logPath(opts.logDir));
    throw error;
  });
  const record = { ...base, ...summaryOf({ opts, cases, rows }), ...costRecord(spend), durationMs: Date.now() - started };
  writeLog(record, logPath(opts.logDir));
  return record;
}

export function quickIntervalLine(perCase) {
  const ratios = meanCi(perCase.map((p) => p.ratio));
  return `mean_ratio ${intervalText(ratios)} vs_baseline=${baselineVerdict({ lo: ratios.lo, hi: ratios.hi })}\n`;
}

function printQuick(record) {
  const { perCase, answers, billedMedianRatio } = record;
  process.stderr.write(quickIntervalLine(perCase));
  process.stderr.write(quickPowerLine(perCase, answers));
  process.stderr.write(`billed_median=${billedMedianRatio.toFixed(3)}\n`);
  process.stderr.write(`${judgeStatusLines(LABELS).join('\n')}\n`);
  for (const p of perCase) process.stderr.write(quickCaseLine(p));
  process.stderr.write(baseLines(record));
  process.stdout.write(summaryLine(record));
}

async function runApi({ opts, cases }) {
  const spend = new Spend(opts.maxUsd);
  const pluginDir = makeStylePlugin(opts.ablate);
  const basePluginDir = opts.baseStyle ? makeStylePlugin(null, fs.readFileSync(opts.baseStyle, 'utf8')) : pluginDir;
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-base-'));
  const baseHome = makeCellHome();
  const armDirs = Object.fromEntries(Object.keys(ARM_ARGS).map((arm) => [arm, fs.mkdtempSync(path.join(os.tmpdir(), `exo-adhd-${arm}-`))]));
  const judgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-judge-'));
  const armHomes = Object.fromEntries(Object.keys(ARM_ARGS).map((arm) => [arm, makeCellHome()]));
  const judgeHome = makeCellHome();
  const reply = ({ arm, prompt, side }) => side === 'base'
    ? claudeReply({ arm, prompt, model: opts.model, pluginDir: basePluginDir, cwd: baseDir, keepCwd: true, home: baseHome })
    : claudeReply({ arm, prompt, model: opts.model, pluginDir, cwd: armDirs[arm], keepCwd: true, home: armHomes[arm] });
  const judge = (call) => claudeJudge({ ...call, cwd: judgeDir, home: judgeHome });
  try {
    if (opts.baseline || opts.conciseBaseline) {
      fs.mkdirSync(STORE, { recursive: true });
      const concise = opts.conciseBaseline;
      const file = concise ? concisePath(opts.model) : BASELINE;
      const existing = !opts.all && fs.existsSync(file) ? readJson(file) : {};
      await buildBaseline({ cases, reply, spend, existing, all: opts.all, arm: concise ? 'concise' : 'default', model: concise ? opts.model : undefined, save: (rows) => fs.writeFileSync(file, JSON.stringify(rows, null, 2)) });
    }
    else if (opts.mode === 'quick') printQuick(await runQuick({ opts, cases, reply, judge, spend }));
    else await runScore({ opts, cases, reply, judge, spend });
  } finally {
    process.stderr.write(`${spend.line().trimEnd()} call_timeouts=${callStats.timeouts} parse_retries=${callStats.parseRetries} dropped_votes=${callStats.droppedVotes}\n`);
    for (const dir of [pluginDir, basePluginDir, baseDir, baseHome, judgeDir, judgeHome, ...Object.values(armDirs), ...Object.values(armHomes)]) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = readCases();
  const selected = selectCases(cases, opts.conciseBaseline || opts.mode === 'quick' ? { ...opts, caseIds: opts.caseIds ?? readQuick() } : opts);
  if (opts.check) runCheck(cases);
  else if (opts.dryRun) runDryRun(opts, selected);
  else if (opts.toLabel) runToLabel(cases);
  else if (opts.addFailLabels) runAddFailLabels(cases, { logDir: opts.logDir });
  else if (opts.calibrate) await runCalibrate(opts);
  else if (opts.stability) await runStability(opts, cases);
  else if (opts.rescore) await withJudge(opts, ({ judge, spend }) => runRescore({ opts, cases: selected, judge, spend }));
  else await runApi({ opts, cases: opts.baseline ? cases : selected });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
