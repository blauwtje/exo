// Measures how dense the instruction prose under skills/, agents/ and
// output-styles/ runs. A unit is a list item or a plain paragraph, read
// outside frontmatter, fenced code, HTML comments, headings and table rows.
// A finding is a list item holding MAX_BULLET_SENTENCES or more sentences, or
// a sentence over MAX_SENTENCE_WORDS words. The allowlist holds the offenders
// the tree carried when the check began; it only ever shrinks.
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

const FENCE = /^\s*(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|etc|cf|incl|approx)\.$/i;
// A sentence ends at . ! or ?, after any closing quote, bracket or emphasis,
// where the next one opens on a capital, a quote, a bracket, a code span or emphasis.
const SENTENCE_BREAK = /(?<=[.!?][)"'”’*_]*)\s+(?=[A-Z"“(`*[_])/u;
// Inside a code span a dot, ! or ? ends no sentence and a space splits no word.
const CODE_SPACE = '\u0001';
const CODE_STOP = '\u0002';

export function instructionFiles(root) {
  return SCANNED_DIRECTORIES
    .map((directory) => path.join(root, directory))
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .sort();
}

// The prose units of one Markdown text, each { kind, line, text } with the
// 1-based line it starts on and its lines joined by single spaces.
export function proseUnits(text) {
  const lines = text.split('\n');
  const units = [];
  let unit = null;
  let fence = null;
  let comment = false;
  let start = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) start = close + 1;
  }
  const close = () => {
    if (unit !== null) units.push({ ...unit, text: unit.text.trim() });
    unit = null;
  };
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const opener = FENCE.exec(line);
    if (opener !== null) {
      close();
      const marker = opener[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (comment || line.trimStart().startsWith('<!--')) {
      close();
      comment = !line.includes('-->');
      continue;
    }
    const trimmed = line.trim().replace(/^>\s?/, '').trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('|')) {
      close();
      continue;
    }
    const item = LIST_ITEM.exec(trimmed);
    if (item !== null) {
      close();
      unit = { kind: 'bullet', line: index + 1, text: item[1] };
    } else if (unit === null) {
      unit = { kind: 'paragraph', line: index + 1, text: trimmed };
    } else {
      unit.text += ` ${trimmed}`;
    }
  }
  close();
  return units;
}

// The sentences of one unit, with Markdown links reduced to their text, a
// leading bold label such as `**Catch the mistake.**` dropped, and each code
// span kept whole.
export function sentences(text) {
  const masked = text
    .replace(/`[^`]*`/g, (span) => span.replace(/ /g, CODE_SPACE).replace(/[.!?]/g, CODE_STOP))
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
    .map((sentence) => sentence.replaceAll(CODE_SPACE, ' ').replaceAll(CODE_STOP, '.'));
}

export function wordCount(sentence) {
  return sentence.replace(/`[^`]*`/g, 'code').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function keyText(text) {
  return text.replace(/\s+/g, ' ').slice(0, KEY_CHARACTERS).trimEnd();
}

// Every finding in one file: { path, line, kind, detail, key }. The key leaves
// out the line number, so an edit above an offender keeps its allowlist entry.
export function fileFindings(relative, text) {
  const findings = [];
  for (const unit of proseUnits(text)) {
    const unitSentences = sentences(unit.text);
    if (unit.kind === 'bullet' && unitSentences.length >= MAX_BULLET_SENTENCES) {
      findings.push({
        path: relative, line: unit.line, kind: 'bullet',
        detail: `bullet holds ${unitSentences.length} sentences`,
        key: `${relative}\tbullet\t${keyText(unit.text)}`
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
    const relative = path.relative(root, file).split(path.sep).join('/');
    return fileFindings(relative, fs.readFileSync(file, 'utf8'));
  });
}

export function readAllowlist(root) {
  const file = path.join(root, ALLOWLIST);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'));
}

// Matches findings against the allowlist as a multiset, so two offenders with
// one key need two entries. Returns the findings no entry covers and the
// entries no finding uses.
export function applyAllowlist(findings, entries) {
  const remaining = new Map();
  for (const entry of entries) remaining.set(entry, (remaining.get(entry) ?? 0) + 1);
  const unlisted = [];
  for (const finding of findings) {
    const left = remaining.get(finding.key) ?? 0;
    if (left > 0) remaining.set(finding.key, left - 1);
    else unlisted.push(finding);
  }
  const stale = [...remaining].flatMap(([entry, left]) => Array(left).fill(entry));
  return { unlisted, stale };
}

export function allowlistText(entries) {
  return [
    '# Instruction-density offenders the tree carried when the check began: path, kind, first 40 characters, tab-separated.',
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
          .map((file) => path.join(file.parentPath, file.name)));
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
    const dropped = new Map();
    for (const entry of stale) dropped.set(entry, (dropped.get(entry) ?? 0) + 1);
    const kept = entries.filter((entry) => {
      const left = dropped.get(entry) ?? 0;
      if (left === 0) return true;
      dropped.set(entry, left - 1);
      return false;
    });
    fs.writeFileSync(path.join(root, ALLOWLIST), allowlistText(kept), 'utf8');
    console.log(`dropped ${stale.length} stale entries; ${kept.length} remain`);
  }
  for (const finding of unlisted) console.log(`${finding.path}:${finding.line}: ${finding.detail}`);
  process.exit(unlisted.length > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
