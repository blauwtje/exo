import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defaultRef } from '../../lib/git.mjs';
import { gitLine } from '#git';

export const MINIMUM_OVERLAP = 0.7;
export const BASE_VARIABLE = 'EXO_RULE_RETENTION_BASE';
export const ALLOWLIST_FILE = 'verify/rule-removals.txt';
const MINIMUM_HASH_LENGTH = 8;
const SHOWN_HASH_LENGTH = 12;
const CHECK_NAME = 'rule retention';
const CHECKED_FILE = /^skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md)$/;
const DIFF_PATHSPEC = ['skills/*/SKILL.md', 'skills/*/references/*.md'];
const CORPUS_FOLDERS = ['skills', 'hooks', 'lib/references', 'agents'];
const CORPUS_EXTENSIONS = ['.md', '.mjs', '.txt'];
const RULE_WORDS = ['never', 'always', 'only', 'must'];
const MEASURE_UNITS = [
  'lines?', 'words?', 'chars?', 'characters?', 'bytes?', 'kb', 'mb', 'tokens?', 'ms', 's', 'secs?', 'seconds?', 'minutes?', 'mins?',
  'hours?', 'h', 'days?', 'files?', 'tasks?', 'attempts?', 'times?', 'rounds?', 'items?', 'agents?', 'runs?', 'x'
];
const RULE_MARKER = new RegExp(
  `\\b(?:${RULE_WORDS.join('|')})\\b|\\bno\\s|\\b\\d+(?:\\.\\d+)?(?:\\s?%|\\s?(?:${MEASURE_UNITS.join('|')})\\b)`,
  'i'
);
const SENTENCE_BREAK = /(?<=[.;!?])\s+/;
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'had', 'its', 'but', 'into', 'than',
  'then', 'them', 'they', 'their', 'there', 'when', 'where', 'which', 'what', 'who', 'whom', 'can', 'may', 'will', 'would', 'should',
  'does', 'did', 'out', 'any', 'all', 'each', 'per', 'via', 'also', 'your', 'you', 'one'
]);

function baseRevision(root, explicit) {
  if (explicit) return explicit;
  const ref = defaultRef(root);
  if (ref === null) return null;
  const mergeBase = gitLine(root, ['merge-base', 'HEAD', ref.ref]);
  return mergeBase === null ? null : mergeBase.trim();
}

export function contentWords(text) {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(tokens.filter((token) => token !== '' && !STOP_WORDS.has(token) && (token.length > 1 || /\d/.test(token))));
}

export function lineHash(text) {
  return crypto.createHash('sha1').update(text.trim()).digest('hex');
}

function ruleSentences(line) {
  return line.split(SENTENCE_BREAK).map((sentence) => sentence.trim()).filter((sentence) => RULE_MARKER.test(sentence));
}

export function removedRuleLines(diffText) {
  const removed = [];
  let file = null;
  let inHunk = false;
  for (const line of diffText.split('\n')) {
    const header = /^diff --git a\/(.+) b\/.+$/.exec(line);
    if (header) {
      file = header[1];
      inHunk = false;
    } else if (line.startsWith('@@')) {
      inHunk = true;
    } else if (inHunk && line.startsWith('-') && file !== null && CHECKED_FILE.test(file)) {
      for (const text of ruleSentences(line.slice(1))) removed.push({ file, text });
    }
  }
  return removed;
}

function corpusFiles(repository) {
  return CORPUS_FOLDERS.flatMap((folder) => {
    const directory = repository.join(folder);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && CORPUS_EXTENSIONS.includes(path.extname(entry.name)))
      .filter((entry) => !entry.parentPath.split(path.sep).includes('node_modules'))
      .map((entry) => path.join(entry.parentPath, entry.name));
  });
}

export function buildCorpus(repository) {
  const postings = new Map();
  let count = 0;
  for (const file of corpusFiles(repository)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const words = contentWords(line);
      if (words.size === 0) continue;
      for (const word of words) {
        if (!postings.has(word)) postings.set(word, []);
        postings.get(word).push(count);
      }
      count += 1;
    }
  }
  return postings;
}

export function isRetained(words, postings) {
  const needed = Math.ceil(words.size * MINIMUM_OVERLAP);
  const hits = new Map();
  for (const word of words) {
    for (const id of postings.get(word) ?? []) {
      const total = (hits.get(id) ?? 0) + 1;
      if (total >= needed) return true;
      hits.set(id, total);
    }
  }
  return false;
}

function readAllowlist(repository) {
  const file = repository.join(ALLOWLIST_FILE);
  if (!fs.existsSync(file)) return [];
  return repository.lines(file)
    .map((line) => line.trim().split(/\s+/)[0].toLowerCase())
    .filter((token) => token.length >= MINIMUM_HASH_LENGTH);
}

function isAllowed(text, allowed) {
  const hash = lineHash(text);
  return allowed.some((entry) => hash.startsWith(entry));
}

function removedDiff(repository, base) {
  return gitLine(repository.root, ['diff', '--no-color', '--no-ext-diff', '--no-renames', '-U0', base, '--', ...DIFF_PATHSPEC], { trim: false });
}

export function checkRuleRetention(report, repository, options = {}) {
  const base = baseRevision(repository.root, options.base ?? process.env[BASE_VARIABLE]);
  if (base === null) return;
  const diff = removedDiff(repository, base);
  if (diff === null) return;
  const removed = removedRuleLines(diff);
  if (removed.length === 0) return;
  const postings = buildCorpus(repository);
  const allowed = readAllowlist(repository);
  const lost = removed.filter(({ text }) => !isAllowed(text, allowed) && !isRetained(contentWords(text), postings));
  if (lost.length === 0) {
    report.result('PASS', CHECK_NAME, `${removed.length} removed rule lines kept elsewhere or allowlisted`);
    return;
  }
  const list = lost.map(({ file, text }) => `${file}: "${text}" [${lineHash(text).slice(0, SHOWN_HASH_LENGTH)}]`).join('; ');
  report.result('FAIL', CHECK_NAME, `removed rule lines found nowhere in skills/, hooks/, lib/references/ or agents/; restore each or add its bracketed hash and a reason to ${ALLOWLIST_FILE}: ${list}`);
}
