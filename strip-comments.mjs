#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CODE_EXTENSIONS, commentSpans } from '#code-comments';

const SKIPPED_FOLDERS = new Set(['node_modules', '.git', '.worktrees']);

function codeFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return path.extname(target).toLowerCase() in CODE_EXTENSIONS ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => !SKIPPED_FOLDERS.has(entry.name))
    .flatMap((entry) => codeFiles(path.join(target, entry.name)));
}

function isDisallowed(span) {
  return !span.allowed || span.doc;
}

function lineCount(text) {
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function lineBounds(text, span) {
  const lineStart = text.lastIndexOf('\n', span.from - 1) + 1;
  const newline = text.indexOf('\n', span.to);
  return { lineStart, lineEnd: newline < 0 ? text.length : newline };
}

function removalRange(text, span) {
  const { lineStart, lineEnd } = lineBounds(text, span);
  const before = text.slice(lineStart, span.from);
  const after = text.slice(span.to, lineEnd);
  if (before.trim() === '' && after.trim() === '') {
    return { from: lineStart, to: Math.min(lineEnd + 1, text.length), whole: true };
  }
  if (before.trim() === '') return { from: span.from, to: span.to + after.length - after.trimStart().length, whole: false };
  return { from: span.from - (before.length - before.trimEnd().length), to: span.to, whole: false };
}

function dropRepeatedBlanks(lines, gaps) {
  const kept = [];
  lines.forEach((line, index) => {
    const previous = kept.at(-1);
    const repeats = line.trim() === '' && gaps.has(index) && (previous === undefined || previous.trim() === '');
    if (!repeats) kept.push(line);
  });
  return kept;
}

function stripText(text, spans) {
  const ranges = spans.map((span) => removalRange(text, span));
  let output = '';
  let position = 0;
  const gapOffsets = [];
  for (const range of ranges) {
    output += text.slice(position, range.from);
    if (range.whole) gapOffsets.push(output.length);
    position = range.to;
  }
  output += text.slice(position);
  const lines = output.split('\n');
  const gaps = new Set();
  let offset = 0;
  lines.forEach((line, index) => {
    if (gapOffsets.includes(offset)) gaps.add(index);
    offset += line.length + 1;
  });
  return dropRepeatedBlanks(lines, gaps).join('\n');
}

function spanText(text, span) {
  return text.split('\n')[span.start - 1].trim();
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const spans = commentSpans(file, text);
  const spanLines = (list) => list.reduce((sum, span) => sum + span.end - span.start + 1, 0);
  const disallowed = spans.filter(isDisallowed);
  return { file, text, disallowed, comments: spanLines(spans), removed: spanLines(disallowed), lines: lineCount(text) };
}

function summaryLine(scans) {
  const sum = (key) => scans.reduce((total, scan) => total + scan[key], 0);
  const lines = sum('lines');
  const percent = lines === 0 ? 0 : (sum('removed') / lines) * 100;
  return `comments=${sum('comments')} disallowed=${sum('removed')} lines=${lines} percent=${percent.toFixed(1)}`;
}

function main(argv) {
  const write = argv.includes('--write');
  const targets = argv.filter((arg) => arg !== '--write');
  const scans = targets.flatMap(codeFiles).map(scanFile);
  for (const scan of scans) {
    for (const span of scan.disallowed) {
      process.stdout.write(`${scan.file}:${span.start} ${spanText(scan.text, span)}\n`);
    }
  }
  process.stdout.write(`${summaryLine(scans)}\n`);
  const found = scans.some((scan) => scan.removed > 0);
  if (write) {
    for (const scan of scans.filter((entry) => entry.disallowed.length > 0)) {
      fs.writeFileSync(scan.file, stripText(scan.text, scan.disallowed));
    }
  }
  return found ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
