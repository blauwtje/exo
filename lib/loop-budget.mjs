import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonOrNull } from './basics.mjs';
import { environmentMs } from './script-flags.mjs';

const LEDGER_NAME = 'loop-ledger.tsv';
const WALL_BUDGET_MS = 1_800_000;
const COLUMNS = ['kind', 'round', 'open_before', 'open_after', 'wall_ms', 'cost_usd', 'verdict'];
const kindsFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'loop-kinds.json');

export function loadKinds() {
  return JSON.parse(fs.readFileSync(kindsFile, 'utf8'));
}

function kindEntry(kind) {
  const entry = loadKinds()[kind];
  if (!entry) throw new Error(`unknown loop kind ${kind}`);
  return entry;
}

export function wallBudgetMs(env = process.env, override = WALL_BUDGET_MS) {
  return environmentMs('EXO_RUN_WALL_MS', override, env);
}

function envName(kind, suffix) {
  return `EXO_LOOP_${kind.toUpperCase().replace(/\W+/g, '_')}_${suffix}`;
}

function runDefaults(env) {
  const home = env.HOME ?? os.homedir();
  return readJsonOrNull(path.join(home, '.config', 'exo', 'run.json'))?.defaults ?? {};
}

function positive(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function defaultCap(kind, env) {
  const defaults = runDefaults(env);
  const alias = kind === 'review-fix' || kind === 'review' ? positive(defaults.repairBound) : undefined;
  return positive(defaults.loopCaps?.[kind]) ?? alias;
}

export function roundCap(kind, env = process.env) {
  const entry = kindEntry(kind);
  return environmentMs(envName(kind, 'CAP'), defaultCap(kind, env) ?? entry.cap, env);
}

export function kindWallMs(kind, env = process.env) {
  const entry = kindEntry(kind);
  const fallback = positive(runDefaults(env).loopWallMs?.[kind]) ?? entry.wallMs;
  return environmentMs(envName(kind, 'WALL_MS'), fallback, env);
}

function pause(ms, { unref, signal }) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (unref) timer.unref();
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function pollUntil(probe, options = {}) {
  const { intervalMs = 1000, wallMs, unref = false, signal, giveUp = () => false, runDir } = options;
  const env = options.env ?? process.env;
  const start = Date.now();
  const end = start + (wallMs ?? kindWallMs('wait', env));
  const ledgerDir = runDir ?? env.EXO_RUN_DIR;
  const finish = (ready) => {
    if (ledgerDir) recordRound(ledgerDir, { kind: 'wait', openBefore: 1, openAfter: ready ? 0 : 1, wallMs: Date.now() - start });
    return ready;
  };
  for (;;) {
    if (signal?.aborted || giveUp()) return false;
    if (await probe()) return finish(true);
    if (Date.now() + intervalMs > end) return finish(false);
    await pause(intervalMs, { unref, signal });
  }
}

export function readLedger(runDir) {
  const file = path.join(runDir, LEDGER_NAME);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(1);
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value, index) => [COLUMNS[index], value])));
}

function sum(rows, column) {
  return rows.reduce((total, row) => total + Number(row[column] || 0), 0);
}

function maxRunUsd(env, options) {
  const limit = Number(options.maxRunUsd ?? env.EXO_MAX_RUN_USD ?? 0);
  return limit > 0 ? limit : Infinity;
}

export function decide(runDir, kind, options = {}) {
  const env = options.env ?? process.env;
  const rows = readLedger(runDir);
  const own = rows.filter((row) => row.kind === kind);
  const wallBudget = wallBudgetMs(env, options.wallBudgetMs);
  if (sum(rows, 'wall_ms') >= wallBudget) return { verdict: 'STOP', reason: 'run wall budget spent' };
  if (sum(rows, 'cost_usd') >= maxRunUsd(env, options)) return { verdict: 'STOP', reason: 'run cost budget spent' };
  if (own.at(-1)?.verdict === 'discard') return { verdict: 'STOP', reason: 'last round made no progress' };
  if (own.at(-1)?.verdict === 'stop') return { verdict: 'STOP', reason: 'kind already stopped' };
  if (own.length >= roundCap(kind, env)) return { verdict: 'STOP', reason: `round cap ${roundCap(kind, env)} reached` };
  return { verdict: 'CONTINUE', reason: `round ${own.length + 1} of ${roundCap(kind, env)}` };
}

export function formatLine(kind, { verdict, reason }) {
  return `LOOP ${kind} ${verdict} ${reason}`;
}

function roundVerdict({ openBefore, openAfter }) {
  if (openBefore === undefined) return 'keep';
  return Number(openAfter) < Number(openBefore) ? 'keep' : 'discard';
}

export function recordRound(runDir, round) {
  kindEntry(round.kind);
  const file = path.join(runDir, LEDGER_NAME);
  const rounds = readLedger(runDir).filter((row) => row.kind === round.kind).length;
  const verdict = Number(round.openAfter) === 0 ? 'stop' : roundVerdict(round);
  const row = [round.kind, rounds + 1, round.openBefore ?? '', round.openAfter, round.wallMs ?? 0, round.costUsd ?? '', verdict];
  fs.mkdirSync(runDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, `${COLUMNS.join('\t')}\n`);
  fs.appendFileSync(file, `${row.join('\t')}\n`);
  return verdict;
}

export function report(runDir) {
  const rows = readLedger(runDir);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  const lines = ['kind\trounds\twall_ms\tcost_usd'];
  for (const kind of kinds) {
    const own = rows.filter((row) => row.kind === kind);
    lines.push([kind, own.length, sum(own, 'wall_ms'), sum(own, 'cost_usd')].join('\t'));
  }
  return lines.join('\n');
}

function main(args) {
  const [flag, runDir, kind] = args;
  if (flag === '--report' && runDir) return console.log(report(runDir));
  if (flag === '--decide' && runDir && kind) return console.log(formatLine(kind, decide(runDir, kind)));
  console.error('usage: loop-budget.mjs --report <run dir> | --decide <run dir> <kind>');
  process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
