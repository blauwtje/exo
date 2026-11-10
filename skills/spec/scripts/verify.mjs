import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { foldText, readClaims } from './claims.mjs';
import { readSources } from './ledger.mjs';

const WEAK_KINDS = new Set(['forum', 'social', 'video']);
const MARKER = /\[\^([^\]\s]+)\](?!:)/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'co.nz', 'co.in', 'com.br', 'github.io']);

function siteOf(url) {
  const labels = new URL(url).hostname.split('.');
  const keep = TWO_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

function reportSentences(report) {
  const prose = report.split('\n').filter((line) => !/^\[\^[^\]]+\]:/.test(line));
  return prose.join('\n').split(/(?<=[.!?](?:\[\^[^\]]+\])*)\s+/);
}

function citedIds(sentence) {
  return [...sentence.matchAll(MARKER)].map((match) => match[1]);
}

function numbersIn(text) {
  return (text.match(NUMBER) ?? []).map((number) => number.replace(/,/g, ''));
}

function footnoteProblem(sentence, rows, sentenceRows, hostByRef) {
  if (rows.length === 0) return 'no stored claim';
  const quotes = foldText(rows.map((row) => row.quote).join(' ')).replace(/(\d),(?=\d)/g, '$1');
  const quoteNumbers = new Set(numbersIn(quotes));
  const absent = numbersIn(sentence.replace(MARKER, '')).find((number) => !quoteNumbers.has(number));
  if (absent) return `number ${absent} not in quote`;
  if (!rows.every((row) => WEAK_KINDS.has(row.kind))) return null;
  const hosts = new Set(sentenceRows.map((row) => hostByRef.get(row.ref)));
  if (hosts.size < 2) return 'forum or social source needs a second independent domain';
  return null;
}

function sentenceFailures(sentence, claims, hostByRef) {
  const failures = [];
  const ids = new Set(citedIds(sentence));
  const sentenceRows = claims.filter((row) => ids.has(row.id));
  for (const id of ids) {
    const rows = claims.filter((row) => row.id === id);
    const problem = footnoteProblem(sentence, rows, sentenceRows, hostByRef);
    if (problem) failures.push(`[^${id}]\t${problem}`);
  }
  return failures;
}

export function verifyReport(runDir) {
  const reportFile = path.join(runDir, 'answer.md');
  if (!fs.existsSync(reportFile)) return ['answer.md\tmissing'];
  const claims = readClaims(runDir);
  const hostByRef = new Map(readSources(runDir).map((row) => [row.ref, siteOf(row.url)]));
  const sentences = reportSentences(fs.readFileSync(reportFile, 'utf8'));
  return sentences.flatMap((sentence) => sentenceFailures(sentence, claims, hostByRef));
}

function main(argv) {
  const [runDir] = argv;
  if (!runDir) {
    process.stderr.write('usage: verify.mjs <run-dir>\n');
    process.exitCode = 2;
    return;
  }
  const failures = verifyReport(runDir);
  for (const line of failures) process.stdout.write(`${line}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) main(process.argv.slice(2));
