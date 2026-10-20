import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mannWhitney } from './statistics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = path.join(ROOT, 'benchmarks', 'baseline-pool.jsonl');
const KEYED_PATHS = ['agents', 'skills', 'hooks', 'lib', 'bin', 'harnesses', 'install.mjs', 'verify.mjs', 'benchmarks/sweep-fixtures.mjs', 'benchmarks/flow-hidden'];
const SERVED = ['cost', 'tokens'];
const FIELDS = ['commit', 'cell', 'model', 'effort', 'claudeVersion'];
const POOL_RESULTS = 'benchmarks/results/2026-10-20-baseline-pool.md';
const SAME = { cell: 'flow-unit', model: 'claude-sonnet-5-5', effort: 'high', claudeVersion: 'unrecorded' };
export const ROUNDS = [
  { round: 'r2', commit: '71a42460', results: 'benchmarks/results/2026-10-19-speed-round2.md', arm: 'base-' },
  { round: 'r3', commit: '71a42460', results: 'benchmarks/results/2026-10-19-speed-round3.md', arm: 'base-' },
  { round: 'r4', commit: '6a7d8012', results: 'benchmarks/results/2026-10-19-speed-round4.md', arm: 'base-', claudeVersion: '2.1.303' },
  { round: 'r6', commit: '31ece02e', results: 'benchmarks/results/2026-10-19-speed-round6.md', arm: 'base-' },
  { round: 'r7', commit: '8d4e6207', results: POOL_RESULTS, arm: 'r7-' },
  { round: 'r8', commit: '82ae8607', results: POOL_RESULTS, arm: 'r8-' },
].map((entry) => ({ ...SAME, ...entry }));

const git = (args, input) => execFileSync('git', args, { cwd: ROOT, input, maxBuffer: 1 << 28 });

export function contentKey({ commit, cell, model, effort, claudeVersion }) {
  const tree = git(['ls-tree', '-r', '-z', commit, '--', ...KEYED_PATHS]).toString().split('\0').filter(Boolean)
    .map((line) => ({ oid: line.split(/\s/)[2], file: line.slice(line.indexOf('\t') + 1) }))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
  const batch = git(['cat-file', '--batch'], tree.map((entry) => entry.oid).join('\n') + '\n');
  const hash = createHash('sha256');
  let at = 0;
  for (const entry of tree) {
    const eol = batch.indexOf(10, at);
    const size = Number(batch.subarray(at, eol).toString().split(' ')[2]);
    hash.update(`${entry.file}\0`).update(batch.subarray(eol + 1, eol + 1 + size)).update('\0');
    at = eol + 2 + size;
  }
  hash.update(JSON.stringify([cell, model, effort, claudeVersion]));
  return hash.digest('hex');
}

export function parseRows(text, arm) {
  let header = null;
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells[0] === 'run') header = cells;
    else if (header && cells[0].startsWith(arm) && cells.length === header.length) {
      rows.push(Object.fromEntries(header.map((name, i) => [name, Number(cells[i])])));
    }
  }
  return rows;
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const column = (rows, name) => rows.map((row) => row[name]);

export function replayRounds(rounds = ROUNDS, root = ROOT) {
  const loaded = rounds.map((entry) => {
    const rows = parseRows(fs.readFileSync(path.join(root, entry.results), 'utf8'), entry.arm);
    if (rows.length === 0) throw new Error(`no rows for arm ${entry.arm} of ${entry.round} in ${entry.results}`);
    return { ...entry, key: contentKey(entry), cost: column(rows, 'cost $'), tokens: column(rows, 'tokens'), wall: column(rows, 'wall s') };
  });
  const pairs = [];
  loaded.forEach((a, i) => loaded.slice(i + 1).forEach((b) => pairs.push({
    a: a.round, b: b.round, match: a.key === b.key,
    cost: mannWhitney(a.cost, b.cost), tokens: mannWhitney(a.tokens, b.tokens), wall: mannWhitney(a.wall, b.wall),
    costShift: mean(b.cost) / mean(a.cost) - 1,
  })));
  const saved = loaded.map((round, i) => ({
    round: round.round, n: round.cost.length,
    usd: loaded.slice(0, i).some((earlier) => earlier.key === round.key) ? round.cost.reduce((sum, v) => sum + v, 0) : 0,
  }));
  const matched = pairs.filter((pair) => pair.match);
  const ok = matched.length > 0 && matched.every((pair) => pair.cost > 0.05 && pair.tokens > 0.05);
  return { pairs, saved, ok };
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad flag ${argv[i]}`);
    out[argv[i].slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[i + 1];
  }
  return out;
}

const readPool = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);

function printReplay() {
  const { pairs, saved, ok } = replayRounds();
  for (const pair of pairs) {
    console.log(`${pair.a} ${pair.b} ${pair.match ? 'match' : 'no match'} cost p=${pair.cost.toFixed(3)} (${(pair.costShift * 100).toFixed(0)}%) tokens p=${pair.tokens.toFixed(3)} wall p=${pair.wall.toFixed(3)}`);
  }
  for (const round of saved) console.log(`${round.round} n=${round.n} saved $${round.usd.toFixed(2)}`);
  console.log(ok ? 'ok: every key-matched pair has cost and tokens p > 0.05' : 'fail: no key-matched pair, or a matched pair has cost or tokens p <= 0.05');
  return ok ? 0 : 1;
}

function missingFieldsExit(given, command) {
  const missing = FIELDS.filter((field) => !given[field]);
  if (missing.length === 0) return null;
  console.error(`missing --${missing.map((field) => field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)).join(', --')}; a pool row needs model, effort and Claude Code version known`);
  return command === 'add' ? 1 : 2;
}

function lookupRow(pool, key) {
  const row = readPool(pool).find((entry) => entry.key === key);
  console.log(row ? JSON.stringify(row) : `miss ${key}`);
  return row ? 0 : 1;
}

function addRow(pool, key, given) {
  if (!given.results || !given.arm) { console.error('add needs --results and --arm'); return 2; }
  if (readPool(pool).some((entry) => entry.key === key)) { console.log(`already pooled ${key}`); return 0; }
  const text = fs.readFileSync(path.join(ROOT, given.results), 'utf8');
  const n = parseRows(text, given.arm).length;
  const date = path.basename(given.results).match(/^\d{4}-\d\d-\d\d/)?.[0];
  if (n === 0 || !date) { console.error(`no ${given.arm} rows or no date in the name of ${given.results}`); return 1; }
  const { commit, cell, model, effort, claudeVersion } = given;
  const row = { key, results: given.results, arm: given.arm, commit, cell, model, effort, claudeVersion, n, date };
  fs.appendFileSync(pool, JSON.stringify(row) + '\n');
  console.log(`pooled ${key}`);
  return 0;
}

function main([command, ...rest]) {
  if (command === 'replay') return printReplay();
  if (!['key', 'lookup', 'add'].includes(command)) {
    console.error('usage: baseline-pool.mjs key|lookup|add|replay [--commit --cell --model --effort --claude-version]');
    return 2;
  }
  const given = flags(rest);
  if (command === 'lookup' && !SERVED.includes(given.metric)) {
    console.error(`the pool serves ${SERVED.join(' and ')} only, not ${given.metric}: wall differs between rounds 3 and 6 under one key (p=0.021) and shifted -28% (p<0.001) between rounds 7 and 8 under different keys`);
    return 2;
  }
  const missingExit = missingFieldsExit(given, command);
  if (missingExit !== null) return missingExit;
  const key = contentKey(given);
  const pool = given.pool ?? POOL;
  if (command === 'key') console.log(key);
  if (command === 'lookup') return lookupRow(pool, key);
  if (command === 'add') return addRow(pool, key, given);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
