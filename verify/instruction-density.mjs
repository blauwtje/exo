import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MAX_BULLET_SENTENCES = 3;
export const MAX_SENTENCE_WORDS = 40;
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

export function fileFindings(relative, text) {
  const findings = [];
  for (const unit of proseUnits(text)) {
    const unitSentences = sentences(unit.text);
    if (unit.kind === 'bullet' && unitSentences.length >= MAX_BULLET_SENTENCES) {
      findings.push({
        path: relative, line: unit.line, kind: 'bullet',
        detail: `bullet holds ${unitSentences.length} sentences`
      });
    }
    for (const sentence of unitSentences) {
      const words = wordCount(sentence);
      if (words > MAX_SENTENCE_WORDS) {
        findings.push({
          path: relative, line: unit.line, kind: 'sentence',
          detail: `sentence holds ${words} words`
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
  const root = fileURLToPath(new URL('..', import.meta.url));
  const findings = densityFindings(root);
  for (const finding of findings) console.log(`${finding.path}:${finding.line}: ${finding.detail}`);
  process.exit(findings.length > 0 ? 1 : 0);
}

// Compared through realpath, so a checkout reached through a symlink still runs.
if (process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
