import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonOrNull, writeAtomic } from '#basics';
import { memoryDirectory } from '#config-directory';
import { isMain } from '#script-flags';
import { LEGACY_EXO_FOLDER } from './scratch-path.mjs';

export const GATE_ONCE_PER_RUN_FROM_MS = 60000;

const CACHE_FILE = 'check-cache.json';
const SUMMARY_LINE = /^SUMMARY [^\r\n]*/gm;
const CLEAN_SUMMARY = / FAIL=0 WARN=0 UNRUN=0\b/;
const NO_FAILURES = / FAIL=0\b/;
const STATIC_GATE = /:static\b|--static\b/;
const LOG_FOLDER = 'check-logs';
const KEPT_VERDICTS = 5;

const cachePath = (root) => path.join(memoryDirectory(root), CACHE_FILE);
const logName = (command, tree) => `${crypto.createHash('sha1').update(`${command}\0${tree}`).digest('hex')}.log`;
const logPath = (root, name) => path.join(memoryDirectory(root), LOG_FOLDER, name);

export function workingTreeKey(root) {
  const git = (args, env = process.env, input) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, input });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-tree-'));
  try {
    const index = path.join(folder, 'index');
    const real = path.resolve(root, git(['rev-parse', '--git-path', 'index']).trim());
    fs.copyFileSync(real, index);
    const { atime, mtime } = fs.statSync(real);
    fs.utimesSync(index, atime, mtime);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '-u'], env);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
      .filter((file) => file !== '' && file !== LEGACY_EXO_FOLDER && !file.startsWith(`${LEGACY_EXO_FOLDER}/`));
    if (untracked.length > 0) git(['add', '--pathspec-from-file=-', '--pathspec-file-nul'], { ...env, GIT_LITERAL_PATHSPECS: '1' }, untracked.join('\0'));
    return git(['write-tree'], env).trim();
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function readCache(root) {
  const cache = readJsonOrNull(cachePath(root));
  return cache !== null && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
}

function verdictsOf(root, command) {
  const entry = readCache(root)[command];
  if (entry === undefined || entry === null || typeof entry !== 'object') return [];
  const earlier = Array.isArray(entry.earlier) ? entry.earlier : [];
  return [entry, ...earlier].filter((candidate) => candidate !== null && typeof candidate === 'object' && typeof candidate.ms === 'number');
}

function treePass(root, command) {
  const key = workingTreeKey(root);
  const entry = verdictsOf(root, command).find((candidate) => candidate.tree === key && (candidate.verdict === undefined || candidate.verdict === 'CLEAN'));
  return entry === undefined ? null : { ms: entry.ms, log: entry.log };
}

export const treePassMs = (root, command) => treePass(root, command)?.ms ?? null;

export function lastPassMs(root, command) {
  const ms = readCache(root)[command]?.ms;
  return typeof ms === 'number' ? ms : null;
}

export function recordPass(root, command, { ms, before = workingTreeKey(root), output }) {
  const trusted = output === undefined || judgeLog(command, output).pass !== null;
  writeEntry(root, command, { ms, before, output: trusted ? output : undefined });
}

function keptVerdicts(cache, command, tree) {
  const { earlier = [], ...latest } = cache[command] ?? {};
  const previous = Object.keys(latest).length === 0 ? [] : [latest, ...earlier];
  return previous.filter((entry) => entry.tree !== tree);
}

function writeEntry(root, command, { ms, before, output }) {
  const cache = readCache(root);
  if (workingTreeKey(root) !== before) return;
  const log = output === undefined ? undefined : logName(command, before);
  if (log === undefined) fs.rmSync(logPath(root, logName(command, before)), { force: true });
  else writeAtomic(logPath(root, log), output);
  const kept = keptVerdicts(cache, command, before);
  for (const dropped of kept.slice(KEPT_VERDICTS)) {
    if (typeof dropped.log === 'string') fs.rmSync(logPath(root, dropped.log), { force: true });
  }
  const entry = { tree: before, ms, ...(log === undefined ? {} : { log }) };
  cache[command] = kept.length === 0 ? entry : { ...entry, earlier: kept.slice(0, KEPT_VERDICTS) };
  writeAtomic(cachePath(root), `${JSON.stringify(cache)}\n`);
}

function summaryLine(output) {
  return output.match(SUMMARY_LINE)?.at(-1) ?? null;
}

const countsOf = (output, pattern) => [...output.matchAll(pattern)].reduce((sum, match) => sum + Number(match[1]), 0);

const LOG_SHAPES = [
  {
    recognizes: (output) => /^(?:#|ℹ) tests \d+/m.test(output) && /^(?:#|ℹ) fail \d+/m.test(output),
    failures: (output) => countsOf(output, /^(?:#|ℹ) fail (\d+)/gm),
  },
  {
    recognizes: (output) => /^1\.\.\d+/m.test(output),
    failures: (output) => (output.match(/^not ok\b/gm) ?? []).length,
  },
];

function summaryJudgement(command, summary) {
  if (!NO_FAILURES.test(summary)) return { pass: false, refusal: `its log ends "${summary}"` };
  if (STATIC_GATE.test(command) || CLEAN_SUMMARY.test(summary)) return { pass: true, refusal: null };
  return { pass: false, refusal: `its log ends "${summary}", not FAIL=0 WARN=0 UNRUN=0` };
}

export function judgeLog(command, output) {
  const summary = summaryLine(output);
  if (summary !== null) return summaryJudgement(command, summary);
  const shape = LOG_SHAPES.find((candidate) => candidate.recognizes(output));
  if (shape === undefined) return { pass: null, refusal: null };
  const failures = shape.failures(output);
  return failures === 0 ? { pass: true, refusal: null } : { pass: false, refusal: `its log reports ${failures} failing` };
}

export function gateRefusal(command, output) {
  return judgeLog(command, output).refusal;
}

export function cachedPass(root, key, command = key) {
  const hit = treePass(root, key);
  const name = hit?.log;
  if (hit === null || typeof name !== 'string') return null;
  let output;
  try {
    output = fs.readFileSync(logPath(root, name), 'utf8');
  } catch {
    return null;
  }
  return judgeLog(command, output).pass === true ? { ms: hit.ms } : null;
}

function query(root, command) {
  const hit = command === undefined ? null : cachedPass(root, command);
  process.stdout.write(hit === null ? 'miss\n' : `pass ${hit.ms}\n`);
  process.exitCode = hit === null ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const at = process.argv.indexOf('--query');
  query(process.cwd(), at === -1 ? undefined : process.argv[at + 1]);
}
