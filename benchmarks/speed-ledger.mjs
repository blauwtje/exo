import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KEYS = ['id', 'title', 'area', 'targets', 'mechanism', 'verdict', 'metric', 'threshold', 'measured', 'n', 'costUsd', 'wallS', 'date', 'commit', 'results', 'retryWhen', 'related', 'fingerprint'];
export const VERDICTS = ['rej', 'nog', 'un', 'deferred', 'pass', 'landed'];
const LANDED = ['landed'];
const isText = (value) => typeof value === 'string';
const SHAPE = {
  id: ['a string', isText],
  title: ['a string', isText],
  targets: ['an array of strings', (value) => Array.isArray(value) && value.every(isText)],
  related: ['an array of strings', (value) => Array.isArray(value) && value.every(isText)],
  results: ['a string or null', (value) => value === null || isText(value)],
};
const MD_FIRST_LINE = '<!-- Generated from speed-ledger.jsonl by `node benchmarks/speed-ledger.mjs --render`; edit the JSONL, not this file. -->';
const BASELINE = 'Current flow-unit baseline: [round 8](results/2026-10-20-speed-round8.md), main `82ae8607` after the truncate fixture fix (wall 136.6 s, cost $0.598, n=15).';
const INTRO = `# Build-speed idea ledger

This file records every build-speed idea that did not land, or landed without a measured gain, so it is known and not tried again.
An idea is retried only when the circumstances in its "Retry when:" line change and it now looks promising.
New entry → add one JSON line to \`benchmarks/speed-ledger.jsonl\` with every key, then run \`node benchmarks/speed-ledger.mjs --render\`.

## Index

Read [the build profile](results/2026-10-19-build-profile.md) first for a speed idea: it shows where build wall time goes and what the fix loop costs.

${BASELINE}

Open an entry below only when an idea is close. Verdict: rej = rejected, un = untried, nog = landed or tried, no measured gain, deferred = paid follow-up not run, pass = threshold met in a test but not landed, landed = landed with a gain.
`;

export function fingerprint({ title, targets }) {
  const name = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const files = [...targets].sort().join('\n');
  return createHash('sha256').update(`${name}\n${files}`).digest('hex');
}

function parseLedger(text) {
  const rows = [];
  const problems = [];
  text.split('\n').forEach((line, index) => {
    if (!line) return;
    try {
      const row = JSON.parse(line);
      if (row === null || typeof row !== 'object' || Array.isArray(row)) problems.push(`line ${index + 1}: not a JSON object`);
      else rows.push({ row, line: index + 1 });
    } catch (error) {
      problems.push(`line ${index + 1}: not JSON (${error.message})`);
    }
  });
  return { rows, problems };
}

export function readLedger(file = path.join(ROOT, 'benchmarks', 'speed-ledger.jsonl')) {
  const { rows, problems } = parseLedger(readFileSync(file, 'utf8'));
  if (problems.length) throw new Error(problems.join('; '));
  return rows.map((entry) => entry.row);
}

function link(id, byId) {
  return `[${byId.get(id)?.title ?? id}](#${id})`;
}

function entryLine(row, byId) {
  const body = row.threshold ? `Threshold: ${row.threshold} Measured: ${row.measured}` : row.measured;
  const retry = row.retryWhen ? `Retry when: ${row.retryWhen}` : null;
  const related = row.related.length ? `Related: ${row.related.map((id) => link(id, byId)).join(', ')}.` : null;
  const parts = [`<a id="${row.id}"></a>**${row.title}**`, row.mechanism, body, retry, related];
  return `- ${parts.filter(Boolean).join(' ')}`;
}

export function renderLedger(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const index = rows.map((row) => `- ${link(row.id, byId)} → ${row.verdict}`);
  const open = rows.filter((row) => !LANDED.includes(row.verdict));
  const landed = rows.filter((row) => LANDED.includes(row.verdict));
  const section = (heading, list) => [`## ${heading}`, '', ...list.map((row) => entryLine(row, byId)), ''];
  const lines = [MD_FIRST_LINE, INTRO.trimEnd(), '', ...index, '', ...section('Not landed, or no measured gain', open), ...section('Landed with a measured gain', landed)];
  return `${lines.join('\n').trimEnd()}\n`;
}

function rowProblems({ row, line }, root) {
  const found = [];
  const where = `line ${line}`;
  const missing = KEYS.filter((key) => !(key in row));
  if (missing.length) return [`${where}: missing keys ${missing.join(', ')}`];
  const wrong = Object.entries(SHAPE).filter(([key, [, valid]]) => !valid(row[key]));
  if (wrong.length) return wrong.map(([key, [expected]]) => `${where} (${row.id}): ${key} is not ${expected}`);
  if (!VERDICTS.includes(row.verdict)) found.push(`${where} (${row.id}): invalid verdict ${row.verdict}`);
  if (row.fingerprint !== fingerprint(row)) found.push(`${where} (${row.id}): fingerprint does not match title and targets`);
  if (row.results && !existsSync(path.join(root, row.results))) found.push(`${where} (${row.id}): results path ${row.results} does not exist`);
  return found;
}

function duplicateProblems(rows, key) {
  const seen = new Set();
  const found = [];
  for (const { row, line } of rows) {
    if (seen.has(row[key])) found.push(`line ${line}: duplicate ${key} ${row[key]}`);
    seen.add(row[key]);
  }
  return found;
}

function relatedProblems(rows) {
  const ids = new Set(rows.map(({ row }) => row.id));
  return rows.flatMap(({ row, line }) => (Array.isArray(row.related) ? row.related : []).filter((id) => !ids.has(id)).map((id) => `line ${line} (${row.id}): related id ${id} does not exist`));
}

export function checkLedger(root = ROOT) {
  const dir = path.join(root, 'benchmarks');
  const text = readFileSync(path.join(dir, 'speed-ledger.jsonl'), 'utf8');
  const { rows, problems } = parseLedger(text);
  const complete = rows.filter((entry) => KEYS.every((key) => key in entry.row));
  problems.push(...rows.flatMap((entry) => rowProblems(entry, root)));
  problems.push(...duplicateProblems(complete, 'id'), ...duplicateProblems(complete, 'fingerprint'), ...relatedProblems(complete));
  const ids = complete.map((entry) => entry.row.id);
  if (ids.join('\n') !== [...ids].sort().join('\n')) problems.push('rows are not sorted by id');
  if (text.includes('\r')) problems.push('the JSONL holds CR characters, use LF');
  if (problems.length) return problems;
  const mdFile = path.join(dir, 'speed-ledger.md');
  if (!existsSync(mdFile)) return ['speed-ledger.md is missing, run `node benchmarks/speed-ledger.mjs --render`'];
  const md = readFileSync(mdFile, 'utf8');
  if (md !== renderLedger(complete.map((entry) => entry.row))) problems.push('speed-ledger.md differs from the render of the JSONL, run `node benchmarks/speed-ledger.mjs --render`');
  return problems;
}

export function indexSection(md) {
  const start = md.indexOf('## Index');
  const next = md.indexOf('\n## ', start + 1);
  return `${md.slice(start, next < 0 ? undefined : next).trimEnd()}\n`;
}

function main(args) {
  if (args.includes('--index')) {
    process.stdout.write(indexSection(renderLedger(readLedger())));
    return 0;
  }
  if (args.includes('--render')) {
    writeFileSync(path.join(ROOT, 'benchmarks', 'speed-ledger.md'), renderLedger(readLedger()));
    return 0;
  }
  if (!args.includes('--check')) {
    console.error('usage: node benchmarks/speed-ledger.mjs --render | --check | --index');
    return 2;
  }
  const problems = checkLedger();
  problems.forEach((problem) => console.error(`ledger: ${problem}`));
  if (!problems.length) console.log('ledger ok');
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
