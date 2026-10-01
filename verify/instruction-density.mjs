// Measures how dense the instruction prose under skills/, agents/ and
// output-styles/ runs. A unit is a list item or a plain paragraph, read
// outside frontmatter, fenced code, HTML comments, headings and table rows.
// A finding is a list item holding MAX_BULLET_SENTENCES or more sentences, or
// a sentence over MAX_SENTENCE_WORDS words. The allowlist holds the offenders
// the tree carried when the check began; INSTRUCTION_DENSITY_ALLOWLIST_LOCK in
// verify/budgets.mjs caps its length, so it only ever shrinks.
//
//   node verify/instruction-density.mjs            list findings off the allowlist and exit 1 when any
//   node verify/instruction-density.mjs --prune    drop allowlist entries that no longer match a finding
//
// --prune never adds an entry: a new offender gets split, not allowlisted.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const MAX_BULLET_SENTENCES = 3;
export const MAX_SENTENCE_WORDS = 40;
export const KEY_CHARACTERS = 40;
export const ALLOWLIST = 'verify/instruction-density-allowlist.txt';
export const SCANNED_DIRECTORIES = ['skills', 'agents', 'output-styles'];
// Markdown under a scanned directory that shows an artifact rather than instructing.
export const NOT_INSTRUCTIONS = ['skills/spec/references/example-plan.md'];

const FENCE = /^\s*(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)]|[a-z][.)])\s+(.*)$/;
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|etc|cf|incl|approx)\.$/i;
// A sentence ends at . ! or ?, after any closing quote, bracket or emphasis,
// where the next one opens on a capital, a quote, a bracket, a code span or emphasis.
const SENTENCE_BREAK = /(?<=[.!?][)"'”’*_]*)\s+(?=[A-Z"“(`*[_])/u;
// Inside a code span a dot, ! or ? ends no sentence and a space splits no word.
const CODE_SPACE = '\u0001';
const CODE_STOP = '\u0002';
// Inside a short quoted example a stop ends no sentence and comes back as
// itself; the stops just before the closing quote still end one.
const QUOTED = /"[^"\n]{1,80}"|“[^”\n]{1,80}”/g;
const QUOTE_STOPS = { '.': '\u0003', '!': '\u0004', '?': '\u0005' };
const QUOTE_RESTORE = Object.fromEntries(Object.entries(QUOTE_STOPS).map(([stop, mask]) => [mask, stop]));

const posix = (root, file) => path.relative(root, file).split(path.sep).join('/');

export function instructionFiles(root) {
  return SCANNED_DIRECTORIES
    .map((directory) => path.join(root, directory))
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .filter((file) => !NOT_INSTRUCTIONS.includes(posix(root, file)))
    .sort();
}

// The prose units of one Markdown text, each { kind, line, text } with the
// 1-based line it starts on and its lines joined by single spaces.
export function proseUnits(text) {
  const lines = text.split('\n');
  const units = [];
  // The list items still open, outermost first: an indented paragraph after a
  // blank line or a fence continues the deepest one it sits under.
  const items = [];
  let unit = null;
  let fence = null;
  let comment = false;
  let start = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) start = close + 1;
  }
  const leaveItems = (indent) => {
    while (items.length > 0 && items[items.length - 1].indent >= indent) items.pop();
  };
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.length - line.trimStart().length;
    const opener = FENCE.exec(line);
    if (opener !== null) {
      unit = null;
      const marker = opener[1];
      if (fence === null) {
        fence = marker;
        leaveItems(indent);
      } else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (comment || line.trimStart().startsWith('<!--')) {
      unit = null;
      comment = !line.includes('-->');
      continue;
    }
    const trimmed = line.trim().replace(/^>\s?/, '').trim();
    if (trimmed.startsWith('#')) {
      unit = null;
      items.length = 0;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('|')) {
      unit = null;
      continue;
    }
    const item = LIST_ITEM.exec(trimmed);
    if (item !== null) {
      leaveItems(indent);
      unit = { kind: 'bullet', line: index + 1, text: item[1] };
      units.push(unit);
      items.push({ indent, unit });
    } else if (unit !== null) {
      unit.text += ` ${trimmed}`;
    } else {
      leaveItems(indent);
      if (items.length > 0) {
        unit = items[items.length - 1].unit;
        unit.text += ` ${trimmed}`;
      } else {
        unit = { kind: 'paragraph', line: index + 1, text: trimmed };
        units.push(unit);
      }
    }
  }
  return units.map((entry) => ({ ...entry, text: entry.text.trim() }));
}

// The sentences of one unit, with Markdown links reduced to their text, a
// leading bold label such as `**Catch the mistake.**` dropped, and each code
// span and short quoted example kept whole.
export function sentences(text) {
  const masked = text
    .replace(/`[^`]*`/g, (span) => span.replace(/ /g, CODE_SPACE).replace(/[.!?]/g, CODE_STOP))
    .replace(QUOTED, (quote) => {
      const body = quote.slice(0, -1);
      const end = body.search(/[.!?]*$/);
      return body.slice(0, end).replace(/[.!?]/g, (stop) => QUOTE_STOPS[stop]) + body.slice(end) + quote.slice(-1);
    })
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\*\*[^*]+?(?:[.:]\*\*|\*\*:)\s+(?=\S)/, '');
  const pieces = masked.split(SENTENCE_BREAK);
  const merged = [];
  for (const piece of pieces) {
    if (merged.length > 0 && ABBREVIATION.test(merged[merged.length - 1])) merged[merged.length - 1] += ` ${piece}`;
    else merged.push(piece);
  }
  return merged
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence))
    .map((sentence) => sentence.replaceAll(CODE_SPACE, ' ').replaceAll(CODE_STOP, '.')
      .replace(/[\u0003-\u0005]/g, (mask) => QUOTE_RESTORE[mask]));
}

export function wordCount(sentence) {
  return sentence.replace(/`[^`]*`/g, 'code').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function keyText(text) {
  return text.replace(/\s+/g, ' ').slice(0, KEY_CHARACTERS).trimEnd();
}

// Every finding in one file: { path, line, kind, detail, key }. The key leaves
// out the line number, so an edit above an offender keeps its allowlist entry,
// and a bullet's key records its sentence count, so the bullet cannot grow.
export function fileFindings(relative, text) {
  const findings = [];
  for (const unit of proseUnits(text)) {
    const unitSentences = sentences(unit.text);
    if (unit.kind === 'bullet' && unitSentences.length >= MAX_BULLET_SENTENCES) {
      findings.push({
        path: relative, line: unit.line, kind: 'bullet',
        detail: `bullet holds ${unitSentences.length} sentences`,
        key: `${relative}\tbullet\t${unitSentences.length}\t${keyText(unit.text)}`
      });
    }
    for (const sentence of unitSentences) {
      const words = wordCount(sentence);
      if (words > MAX_SENTENCE_WORDS) {
        findings.push({
          path: relative, line: unit.line, kind: 'sentence',
          detail: `sentence holds ${words} words`,
          key: `${relative}\tsentence\t${keyText(sentence)}`
        });
      }
    }
  }
  return findings;
}

export function densityFindings(root) {
  return instructionFiles(root).flatMap((file) => {
    return fileFindings(posix(root, file), fs.readFileSync(file, 'utf8'));
  });
}

export function readAllowlist(root) {
  const file = path.join(root, ALLOWLIST);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'));
}

// A key splits into the text it matches on and the sentence count a bullet
// entry allows or a bullet finding holds; a sentence key carries no count.
function splitKey(key) {
  const [file, kind, count, ...rest] = key.split('\t');
  if (kind === 'bullet' && /^\d+$/.test(count ?? '')) return { match: [file, kind, ...rest].join('\t'), count: Number(count) };
  return { match: key, count: 0 };
}

// Matches findings against the allowlist as a multiset, so two offenders with
// one key need two entries, and a bullet entry covers a bullet of at most its
// recorded sentences. Returns the findings no entry covers and the entries no
// finding uses, each in its original order.
export function applyAllowlist(findings, entries) {
  const open = new Map();
  entries.forEach((entry, index) => {
    const { match, count } = splitKey(entry);
    open.set(match, [...(open.get(match) ?? []), { count, index }]);
  });
  const used = new Set();
  const covered = new Set();
  const largestFirst = [...findings].sort((left, right) => splitKey(right.key).count - splitKey(left.key).count);
  for (const finding of largestFirst) {
    const { match, count } = splitKey(finding.key);
    const fits = (open.get(match) ?? []).filter((entry) => !used.has(entry.index) && entry.count >= count);
    if (fits.length === 0) continue;
    const tightest = fits.reduce((best, entry) => (entry.count < best.count ? entry : best));
    used.add(tightest.index);
    covered.add(finding);
  }
  return {
    unlisted: findings.filter((finding) => !covered.has(finding)),
    stale: entries.filter((_, index) => !used.has(index))
  };
}

// The entries left once each stale entry drops one matching line.
export function pruneAllowlist(entries, stale) {
  const dropped = new Map();
  for (const entry of stale) dropped.set(entry, (dropped.get(entry) ?? 0) + 1);
  return entries.filter((entry) => {
    const left = dropped.get(entry) ?? 0;
    if (left === 0) return true;
    dropped.set(entry, left - 1);
    return false;
  });
}

export function allowlistText(entries) {
  return [
    '# Instruction-density offenders the tree carried when the check began: path, kind, a bullet\'s sentence count, first 40 characters, tab-separated.',
    '# Split an offender and delete its line; `node verify/instruction-density.mjs --prune` drops lines that match nothing.',
    ...entries,
    ''
  ].join('\n');
}

// Sentences per skill across SKILL.md and its references: the rule count a
// session reading every reference of that skill would hold.
export function rulesPerSkill(root) {
  const skillsRoot = path.join(root, 'skills');
  if (!fs.existsSync(skillsRoot)) return [];
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => {
      const directory = path.join(skillsRoot, entry.name);
      const references = path.join(directory, 'references');
      const files = [path.join(directory, 'SKILL.md')];
      if (fs.existsSync(references)) {
        files.push(...fs.readdirSync(references, { recursive: true, withFileTypes: true })
          .filter((file) => file.isFile() && file.name.endsWith('.md'))
          .map((file) => path.join(file.parentPath, file.name))
          .filter((file) => !NOT_INSTRUCTIONS.includes(posix(root, file))));
      }
      const count = files.reduce((sum, file) => sum
        + proseUnits(fs.readFileSync(file, 'utf8')).reduce((inner, unit) => inner + sentences(unit.text).length, 0), 0);
      return { skill: entry.name, sentences: count };
    })
    .sort((left, right) => right.sentences - left.sentences || left.skill.localeCompare(right.skill));
}

function main() {
  const { values } = parseArgs({ options: { prune: { type: 'boolean', default: false } } });
  const root = fileURLToPath(new URL('..', import.meta.url));
  const entries = readAllowlist(root);
  const { unlisted, stale } = applyAllowlist(densityFindings(root), entries);
  if (values.prune) {
    const kept = pruneAllowlist(entries, stale);
    fs.writeFileSync(path.join(root, ALLOWLIST), allowlistText(kept), 'utf8');
    console.log(`dropped ${stale.length} stale entries; ${kept.length} remain: set INSTRUCTION_DENSITY_ALLOWLIST_LOCK.entries in verify/budgets.mjs to ${kept.length}`);
  }
  for (const finding of unlisted) console.log(`${finding.path}:${finding.line}: ${finding.detail}`);
  process.exit(unlisted.length > 0 ? 1 : 0);
}

// Compared through realpath, so a checkout reached through a symlink still runs.
if (process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
