#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { makeCellHome } from './cell-home.mjs';
import { gateReply } from './adhd/gates.mjs';
import { DEFAULT_JUDGE_MODEL, DIMENSIONS, QUIET_ENV, calibrate, claudeJudge, judgeBatch, requireCost } from './adhd/judges.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const CASES = path.join(import.meta.dirname, 'adhd', 'cases.jsonl');
// why: the baseline and labels are gitignored, so inside the checkout every new worktree lacks them and removing one deletes them; the git common dir is shared by all worktrees and never committed.
const STORE = path.resolve(ROOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim(), 'exo', 'adhd');
const BASELINE = path.join(STORE, 'baseline.json');
const LOG_DIR = path.join(ROOT, '.exo', 'adhd-score');
const LABELS = path.join(STORE, 'labels.jsonl');
const LABELS_PER_DIMENSION = 5;
export const REPLY_MODEL = 'claude-opus-5-5';
const RUNS = 3;
const ADHD_RUNS = 1;
const SCORE_MAX_USD = 1;
const BASELINE_MAX_USD = 4;

export const readCases = (file = CASES) =>
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
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

function spawnClaude({ args, input, cwd, home }) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, env: { ...process.env, ...QUIET_ENV, HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude failed: ${err.trim()}`))));
    child.stdin.end(input);
  });
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

export async function buildBaseline({ cases, reply, spend, runs = RUNS }) {
  const stage = makeStager();
  const baseline = {};
  for (const c of cases) {
    const results = await stage('default', runs, () => reply({ arm: 'default', prompt: promptOf(c) }));
    results.forEach((r) => spend.add(r.cost));
    baseline[c.id] = { replies: results.map((r) => r.text), tokens: results.map((r) => r.tokens), mean: mean(results.map((r) => r.tokens)), cost: results.reduce((sum, r) => sum + r.cost, 0) };
  }
  return baseline;
}

async function judgeFailures({ c, texts, judge, judgeModel, spend }) {
  const verdicts = await Promise.all(DIMENSIONS.map((dimension) =>
    judgeBatch({ dimension, replies: texts, question: c.question, facts: c.facts, judge, model: judgeModel, onCost: (cost) => spend.add(cost, 'judge') })));
  return DIMENSIONS.filter((_, d) => verdicts[d].some((v) => v !== 'PASS')).map((dimension) => `judge:${dimension}`);
}

async function scoreCase({ c, results, baseline, judge, judgeModel, spend }) {
  const gates = results.map((r) => gateReply(r.text, c));
  const failed = gates.flatMap((g) => g.failed);
  if (failed.length === 0) failed.push(...(await judgeFailures({ c, texts: results.map((r) => r.text), judge, judgeModel, spend })));
  const tokens = mean(results.map((r) => r.tokens));
  const ratio = failed.length === 0 ? tokens / baseline[c.id].mean : 1;
  return { id: c.id, replies: results.map((r) => r.text), tokens, baselineTokens: baseline[c.id].mean, failed: [...new Set(failed)], ratio };
}

function assertProjection({ spend, done, total }) {
  const projected = (spend.total / done) * total;
  if (projected <= spend.maxUsd) return;
  throw new Error(`projected_usd=${projected.toFixed(4)} over --max-usd ${spend.maxUsd}`);
}

// why: Decision 2 fixes the adhd arm at 1 run per case so every improve round scores on the same footing.
export async function scoreCases({ cases, baseline, reply, judge, judgeModel, spend, runs = ADHD_RUNS }) {
  const missing = cases.filter((c) => !baseline[c.id]).map((c) => c.id);
  if (missing.length > 0) throw new Error(`baseline lacks cases: ${missing.join(', ')}; run with --baseline`);
  process.stderr.write(`runs=${runs}\n`);
  const stage = makeStager();
  const perCase = [];
  for (const c of cases) {
    const results = await stage('adhd', runs, () => reply({ arm: 'adhd', prompt: promptOf(c) }));
    results.forEach((r) => spend.add(r.cost));
    perCase.push(await scoreCase({ c, results, baseline, judge, judgeModel, spend }));
    // why: the mean cost of the cases so far prices the whole run; checking after every case catches later cases that cost more than the first.
    assertProjection({ spend, done: perCase.length, total: cases.length });
  }
  return { score: mean(perCase.map((p) => p.ratio)), perCase, runs };
}

// why: --check proves the committed baseline matches the cases with zero API calls.
export function checkBaseline({ cases, baseline, runs = RUNS }) {
  const problems = [];
  for (const c of cases) {
    const b = baseline[c.id];
    if (!b) { problems.push(`${c.id}: missing from baseline`); continue; }
    if (!Array.isArray(b.tokens) || b.tokens.length !== runs) problems.push(`${c.id}: needs ${runs} token counts`);
    if (!Array.isArray(b.replies) || b.replies.length !== runs) problems.push(`${c.id}: needs ${runs} replies`);
    if (Array.isArray(b.tokens) && b.tokens.length > 0 && Math.abs(mean(b.tokens) - b.mean) > 1e-9) problems.push(`${c.id}: mean ${b.mean} != ${mean(b.tokens)}`);
  }
  return problems;
}

// why: labels mix default and adhd replies; each dimension takes a different slice of the interleaved pool.
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
  if (items.length < LABELS_PER_DIMENSION) throw new Error(`need ${LABELS_PER_DIMENSION} stored replies to label, have ${items.length}`);
  return DIMENSIONS.flatMap((dimension, d) => Array.from({ length: LABELS_PER_DIMENSION }, (_, k) => {
    const { arm, ...item } = items[(d * LABELS_PER_DIMENSION + k) % items.length];
    return { id: item.id, dimension, question: item.question, facts: item.facts, reply: item.reply, label: null };
  }));
}

export const readLabels = (file = LABELS) =>
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.label === 'PASS' || row.label === 'FAIL');

export async function calibrateLines({ labels, judge, model }) {
  const report = await calibrate({ labels, judge, model });
  return DIMENSIONS.map((dimension) => `${dimension} ${report[dimension].agree}/${report[dimension].total}`);
}

function latestAdhdReplies() {
  const logs = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  if (logs.length === 0) return {};
  const { perCase = [] } = JSON.parse(fs.readFileSync(path.join(LOG_DIR, logs.at(-1)), 'utf8'));
  return Object.fromEntries(perCase.filter((p) => p.replies).map((p) => [p.id, p.replies]));
}

const FLAGS = { '--baseline': 'baseline', '--check': 'check', '--to-label': 'toLabel', '--calibrate': 'calibrate' };
const VALUES = { '--runs': ['runs', Number], '--max-usd': ['maxUsd', Number], '--judge-model': ['judgeModel', String], '--model': ['model', String] };

function parseArgs(argv) {
  const opts = { toLabel: false, calibrate: false, baseline: false, check: false, runs: ADHD_RUNS, maxUsd: null, judgeModel: DEFAULT_JUDGE_MODEL, model: REPLY_MODEL };
  for (let i = 0; i < argv.length; i += 1) {
    if (FLAGS[argv[i]]) opts[FLAGS[argv[i]]] = true;
    else if (VALUES[argv[i]]) { const [key, cast] = VALUES[argv[i]]; opts[key] = cast(argv[++i]); }
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (opts.maxUsd === null) opts.maxUsd = opts.baseline ? BASELINE_MAX_USD : SCORE_MAX_USD;
  if (!Number.isFinite(opts.maxUsd)) throw new Error('--max-usd needs a number');
  if (!Number.isInteger(opts.runs) || opts.runs < 1) throw new Error('--runs needs a positive integer');
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

async function runCalibrate(opts) {
  if (!fs.existsSync(LABELS)) throw new Error(`${LABELS} is missing; run with --to-label`);
  process.stdout.write(`${(await calibrateLines({ labels: readLabels(), model: opts.judgeModel })).join('\n')}\n`);
}

async function runScore({ opts, cases, reply, judge, spend }) {
  const result = await scoreCases({ cases, baseline: readBaseline(), reply, judgeModel: opts.judgeModel, spend, runs: opts.runs });
  for (const p of result.perCase) process.stderr.write(`${p.id} ratio=${p.ratio.toFixed(2)} failed=${p.failed.join(',') || 'none'}\n`);
  writeLog({ ...result, cost_usd: spend.total, reply_cost_usd: spend.reply, judge_cost_usd: spend.judge });
  process.stdout.write(`${result.score.toFixed(2)}\n`);
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
    if (opts.baseline) fs.writeFileSync(BASELINE, JSON.stringify(await buildBaseline({ cases, reply, spend }), null, 2));
    else await runScore({ opts, cases, reply, judge, spend });
  } finally {
    process.stderr.write(spend.line());
    for (const dir of [pluginDir, judgeDir, judgeHome, ...Object.values(armDirs), ...Object.values(armHomes)]) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = readCases();
  if (opts.check) runCheck(cases);
  else if (opts.toLabel) runToLabel(cases);
  else if (opts.calibrate) await runCalibrate(opts);
  else await runApi({ opts, cases });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
