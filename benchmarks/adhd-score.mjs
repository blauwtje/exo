#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { makeCellHome } from './cell-home.mjs';
import { gateReply } from './adhd/gates.mjs';
import { DEFAULT_JUDGE_MODEL, JUDGE_CONCURRENCY, JUDGE_VOTES, callStats, calibrate, claudeJudge, judgeStability, judgeVote, missingFacts, requireCost, spawnClaude } from './adhd/judges.mjs';
import { buildFailRows } from './adhd/labels.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const CASES = path.join(import.meta.dirname, 'adhd', 'cases.jsonl');
// why: the baseline and labels are gitignored, so inside the checkout every new worktree lacks them and removing one deletes them; the git common dir is shared by all worktrees and never committed.
const STORE = path.resolve(ROOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim(), 'exo', 'adhd');
const BASELINE = path.join(STORE, 'baseline.json');
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

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// why: `output_tokens` bills thinking too (a 20-word reply logged 186), so length is what the reader sees: each word or number and each punctuation mark counts 1. Local, deterministic, same counter for both arms.
export const visibleTokens = (text) => (String(text).match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []).length;
const meanVisible = (replies) => mean(replies.map(visibleTokens));
const promptOf = (c) => `${c.context}\n\n${c.question}`;

// why: the adhd arm differs from the default arm only by this plugin dir holding the style file.
function makeStylePlugin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-plugin-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'));
  fs.mkdirSync(path.join(dir, 'output-styles'));
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'exo', version: '0.0.0', description: 'adhd style only' }));
  fs.copyFileSync(path.join(ROOT, 'output-styles', 'adhd.md'), path.join(dir, 'output-styles', 'adhd.md'));
  return dir;
}

// why: one real `claude -p` in a clean HOME and the arm's fixed empty cwd, so every call shares one system-prompt prefix; a fresh HOME per call put a per-call value in that prefix and each call rewrote ~2.1k cache tokens. Tokens and cost come from its JSON result.
export function claudeReply({ arm, prompt, model = REPLY_MODEL, pluginDir, cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-case-')), keepCwd = false, home: fixedHome }) {
  const home = fixedHome ?? makeCellHome();
  const args = ['-p', '--model', model, '--tools', '', '--output-format', 'json', '--setting-sources', 'project,local', '--strict-mcp-config', '--disable-slash-commands', '--exclude-dynamic-system-prompt-sections'];
  if (arm === 'adhd') args.push('--plugin-dir', pluginDir, '--settings', JSON.stringify({ outputStyle: 'exo:adhd' }));
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

export class Spend {
  constructor(maxUsd) { this.maxUsd = maxUsd; this.reply = 0; this.judge = 0; }
  get total() { return this.reply + this.judge; }
  add(cost, kind = 'reply') {
    this[kind] += cost;
    if (this.total > this.maxUsd) throw new Error(`spend ${this.total.toFixed(4)} passed --max-usd ${this.maxUsd}`);
  }
  line() { return `cost_usd=${this.total.toFixed(4)} reply_cost_usd=${this.reply.toFixed(4)} judge_cost_usd=${this.judge.toFixed(4)}\n`; }
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

// why: a baseline run costs real money and one hung call must not lose finished cases, so existing rows are kept unless `all`, `save` runs after each case, and a failed call names its case and arm.
export async function buildBaseline({ cases, reply, spend, runs = RUNS, existing = {}, all = false, save = () => {} }) {
  const stage = makeStager();
  const baseline = all ? {} : { ...existing };
  for (const c of cases) {
    if (baseline[c.id]) continue;
    const results = await stage('default', runs, () => Promise.resolve(reply({ arm: 'default', prompt: promptOf(c) })).catch((error) => {
      throw new Error(`reply failed for case ${c.id}, arm default: ${error.message}`, { cause: error });
    }));
    results.forEach((r) => spend.add(r.cost));
    baseline[c.id] = { replies: results.map((r) => r.text), tokens: results.map((r) => r.tokens), mean: mean(results.map((r) => r.tokens)), cost: results.reduce((sum, r) => sum + r.cost, 0) };
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

// why: a fixed ADHD_RUNS default keeps every improve round on the same footing.
export async function scoreCases({ cases, baseline, reply, judge = claudeJudge, judgeModel, spend, runs = ADHD_RUNS }) {
  const missing = cases.filter((c) => !baseline[c.id]).map((c) => c.id);
  if (missing.length > 0) throw new Error(`baseline lacks cases: ${missing.join(', ')}; run with --baseline`);
  process.stderr.write(`runs=${runs}\n`);
  const judgeCall = limited(judge, JUDGE_CONCURRENCY);
  const stage = makeStager();
  const perCase = Array(cases.length);
  let done = 0;
  let doneUsd = 0;
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      const c = cases[i];
      const results = await stage('adhd', runs, () => reply({ arm: 'adhd', prompt: promptOf(c) }));
      results.forEach((r) => spend.add(r.cost));
      let caseUsd = results.reduce((sum, r) => sum + r.cost, 0);
      const caseSpend = { add: (cost, kind) => { caseUsd += cost; spend.add(cost, kind); } };
      perCase[i] = await scoreCase({ c, results, baseline, judge: judgeCall, judgeModel, spend: caseSpend });
      done += 1;
      doneUsd += caseUsd;
      // why: the mean cost of the completed cases prices the whole run, not total spend, which already holds the replies of cases still in flight; checking after every case catches later cases that cost more than the first.
      assertProjection({ spend, doneUsd, done, total: cases.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));
  const allRuns = perCase.flatMap((p) => p.runs);
  const passing = allRuns.filter((r) => r.failed.length === 0);
  const passRate = passing.length / allRuns.length;
  const passRatio = passing.length > 0 ? mean(passing.map((r) => r.ratio)) : null;
  const billedTokens = perCase.reduce((sum, p) => sum + p.tokens, 0);
  const baselineBilledTokens = perCase.reduce((sum, p) => sum + p.baselineTokens, 0);
  return { score: mean(perCase.map((p) => p.ratio)), passRate, passRatio, billedTokens, baselineBilledTokens, perCase, runs };
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

const logFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);

// why: rows are rebuilt from the human labels and the newest score logs, so the same inputs give the same rows; a row id already in the file is never written again, and no existing line changes.
export function runAddFailLabels(cases, { file = LABELS, logDir = LOG_DIR, baseline = readBaseline() } = {}) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing; run with --to-label and label it first`);
  const existing = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const logs = logFiles(logDir).slice(-FAIL_SOURCE_LOGS).map((name) => ({ name, log: JSON.parse(fs.readFileSync(path.join(logDir, name), 'utf8')) }));
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
  const logs = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  if (logs.length === 0) return {};
  const { perCase = [] } = JSON.parse(fs.readFileSync(path.join(LOG_DIR, logs.at(-1)), 'utf8'));
  return Object.fromEntries(perCase.filter((p) => p.replies).map((p) => [p.id, p.replies]));
}

const FLAGS = { '--baseline': 'baseline', '--check': 'check', '--to-label': 'toLabel', '--calibrate': 'calibrate', '--add-fail-labels': 'addFailLabels', '--stability': 'stability', '--all': 'all' };
const VALUES = { '--runs': ['runs', Number], '--max-usd': ['maxUsd', Number], '--judge-model': ['judgeModel', String], '--model': ['model', String], '--log-dir': ['logDir', String], '--log': ['log', String], '--repeats': ['repeats', Number], '--votes': ['votes', Number] };

export function parseArgs(argv) {
  const opts = { toLabel: false, calibrate: false, addFailLabels: false, stability: false, baseline: false, all: false, check: false, runs: ADHD_RUNS, maxUsd: null, judgeModel: DEFAULT_JUDGE_MODEL, model: REPLY_MODEL, logDir: LOG_DIR, log: null, repeats: STABILITY_REPEATS, votes: JUDGE_VOTES };
  for (let i = 0; i < argv.length; i += 1) {
    if (FLAGS[argv[i]]) opts[FLAGS[argv[i]]] = true;
    else if (VALUES[argv[i]]) { const [key, cast] = VALUES[argv[i]]; opts[key] = cast(argv[++i]); }
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (opts.all && !opts.baseline) throw new Error('--all needs --baseline');
  if (opts.maxUsd === null) opts.maxUsd = opts.baseline ? BASELINE_MAX_USD : SCORE_MAX_USD;
  if (!Number.isFinite(opts.maxUsd)) throw new Error('--max-usd needs a number');
  if (!Number.isInteger(opts.runs) || opts.runs < 1) throw new Error('--runs needs a positive integer');
  if (!Number.isInteger(opts.repeats) || opts.repeats < 2) throw new Error('--repeats needs an integer of at least 2');
  return opts;
}

function writeLog(record) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(record, null, 2));
}

const readBaseline = () => {
  if (!fs.existsSync(BASELINE)) throw new Error(`${BASELINE} is missing; run with --baseline`);
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
};

function runCheck(cases) {
  const problems = checkBaseline({ cases, baseline: readBaseline() });
  if (problems.length > 0) throw new Error(`baseline check failed:\n${problems.join('\n')}`);
  process.stdout.write(`baseline ok: ${cases.length} cases\n`);
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
    await task({ judge, onCost: (cost) => spend.add(cost, 'judge') });
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
  const items = stabilityItems(cases, JSON.parse(fs.readFileSync(file, 'utf8')));
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

async function runScore({ opts, cases, reply, judge, spend }) {
  const result = await scoreCases({ cases, baseline: readBaseline(), reply, judge, judgeModel: opts.judgeModel, spend, runs: opts.runs });
  for (const p of result.perCase) process.stderr.write(caseLine(p));
  writeLog({ ...result, cost_usd: spend.total, reply_cost_usd: spend.reply, judge_cost_usd: spend.judge });
  process.stderr.write(`pass_rate=${result.passRate.toFixed(3)} pass_ratio=${result.passRatio === null ? 'n/a' : result.passRatio.toFixed(3)}\n`);
  process.stderr.write(`billed_tokens=${Math.round(result.billedTokens)} baseline_billed_tokens=${Math.round(result.baselineBilledTokens)}\n`);
  process.stdout.write(`${result.score.toFixed(3)}\n`);
}

async function runApi({ opts, cases }) {
  const spend = new Spend(opts.maxUsd);
  const pluginDir = makeStylePlugin();
  const armDirs = { default: fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-default-')), adhd: fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-adhd-')) };
  const judgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-judge-'));
  const armHomes = { default: makeCellHome(), adhd: makeCellHome() };
  const judgeHome = makeCellHome();
  const reply = ({ arm, prompt }) => claudeReply({ arm, prompt, model: opts.model, pluginDir, cwd: armDirs[arm], keepCwd: true, home: armHomes[arm] });
  const judge = (call) => claudeJudge({ ...call, cwd: judgeDir, home: judgeHome });
  try {
    if (opts.baseline) fs.mkdirSync(STORE, { recursive: true });
    if (opts.baseline) {
      const existing = !opts.all && fs.existsSync(BASELINE) ? readBaseline() : {};
      await buildBaseline({ cases, reply, spend, existing, all: opts.all, save: (rows) => fs.writeFileSync(BASELINE, JSON.stringify(rows, null, 2)) });
    }
    else await runScore({ opts, cases, reply, judge, spend });
  } finally {
    process.stderr.write(`${spend.line().trimEnd()} call_timeouts=${callStats.timeouts} parse_retries=${callStats.parseRetries} dropped_votes=${callStats.droppedVotes}\n`);
    for (const dir of [pluginDir, judgeDir, judgeHome, ...Object.values(armDirs), ...Object.values(armHomes)]) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = readCases();
  if (opts.check) runCheck(cases);
  else if (opts.toLabel) runToLabel(cases);
  else if (opts.addFailLabels) runAddFailLabels(cases, { logDir: opts.logDir });
  else if (opts.calibrate) await runCalibrate(opts);
  else if (opts.stability) await runStability(opts, cases);
  else await runApi({ opts, cases });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
