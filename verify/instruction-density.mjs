import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MAX_BULLET_SENTENCES = 3;
const MAX_SENTENCE_WORDS = 40;
const SCANNED_DIRECTORIES = ['skills', 'agents', 'output-styles'];
const NOT_INSTRUCTIONS = ['skills/spec/references/example-plan.md'];

const FENCE = /^\s*(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)]|[a-z][.)])\s+(.*)$/;
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|etc|cf|incl|approx)\.$/i;
const SENTENCE_BREAK = /(?<=[.!?][)"'”’*_]*)\s+(?=[A-Z"“(`*[_])/u;
const CODE_SPACE = '\u0001';
const CODE_STOP = '\u0002';
const QUOTED = /"[^"\n]{1,80}"|“[^”\n]{1,80}”/g;
const QUOTE_STOPS = { '.': '\u0003', '!': '\u0004', '?': '\u0005' };
const QUOTE_RESTORE = Object.fromEntries(Object.entries(QUOTE_STOPS).map(([stop, mask]) => [mask, stop]));

const posix = (root, file) => path.relative(root, file).split(path.sep).join('/');

function instructionFiles(root) {
  return SCANNED_DIRECTORIES
    .map((directory) => path.join(root, directory))
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(entry.parentPath, entry.name)))
    .filter((file) => !NOT_INSTRUCTIONS.includes(posix(root, file)))
    .sort();
}

function proseUnits(text) {
  const lines = text.split('\n');
  const units = [];
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

function wordCount(sentence) {
  return sentence.replace(/`[^`]*`/g, 'code').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function fileFindings(relative, text) {
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

function densityFindings(root) {
  return instructionFiles(root).flatMap((file) => {
    return fileFindings(posix(root, file), fs.readFileSync(file, 'utf8'));
  });
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const findings = densityFindings(root);
  for (const finding of findings) console.log(`${finding.path}:${finding.line}: ${finding.detail}`);
  process.exit(findings.length > 0 ? 1 : 0);
}

if (process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
