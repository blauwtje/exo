#!/usr/bin/env node
// phrase-overlap.mjs: every run of eight or more consecutive prose words that
// an exo instruction file shares with a markdown file under a source directory.
// Code, commands and file names are not prose: fenced blocks, inline code, HTML
// comments, URLs, link targets and path-like tokens are dropped, and every drop
// but a link target ends the current word run, so no run is joined across one.
//
// Usage: node phrase-overlap.mjs [--json] <source-dir>...
//   Exo side: every .md file under skills/ and agents/ of this repository.
//   Source side: every .md file under each source dir, skipping .git and node_modules.
//   Prints one line per shared span and a TOTAL line; exits 1 when any span is found.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const EXO_DIRS = ['skills', 'agents'];
const SKIPPED_DIRS = new Set(['.git', 'node_modules']);
const GRAM_LENGTH = 8;
const USAGE_EXIT = 2;
// Stands in for a dropped element, so the word run ends where it stood.
const BREAK = '\u0000';

const FENCE = /^\s*(`{3,}|~{3,})/;
const FRONTMATTER_KEY = /^\s*[A-Za-z0-9_-]+:(?=\s|$)/;
const LINK_DEFINITION = /^\s*\[[^\]]+\]:\s*\S+/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
const IMAGE_OR_LINK = /!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g;
const URL = /<?\b[a-z][a-z0-9+.-]*:\/\/[^\s>)]+>?/gi;
const EDGE_PUNCTUATION = /^[*_"'“”‘’([{<]+|[*_"'“”‘’)\]}>.,;:!?]+$/g;
const WORD_SPLIT = /[^\p{L}\p{N}']+/u;
const IDENTIFIER_PAIR = /^[A-Za-z0-9-]+:[A-Za-z0-9-]+$/;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function walkMarkdown(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found.sort();
}

// ---------------------------------------------------------------------------
// Prose extraction
// ---------------------------------------------------------------------------

function isCodeLike(token) {
  return /[/\\_]/.test(token)
    || /\w\.\w/.test(token)
    || /^-\w/.test(token)
    || token.startsWith('$')
    || token.startsWith('#!')
    || IDENTIFIER_PAIR.test(token);
}

// Prose words of one line, with BREAK wherever a code-like token was dropped.
function lineTokens(text) {
  const tokens = [];
  for (const raw of text.split(/\s+/)) {
    if (raw === '') continue;
    if (raw === BREAK) {
      tokens.push(BREAK);
      continue;
    }
    const trimmed = raw.replace(/[‘’]/g, "'").replace(EDGE_PUNCTUATION, '');
    if (trimmed === '') continue;
    if (isCodeLike(trimmed)) {
      tokens.push(BREAK);
      continue;
    }
    for (const word of trimmed.toLowerCase().split(WORD_SPLIT)) {
      const bare = word.replace(/^'+|'+$/g, '');
      if (bare !== '') tokens.push(bare);
    }
  }
  return tokens;
}

// Removes HTML comments, which may span lines; returns the kept text and
// whether a comment is still open at the end of the line.
function stripComments(line, insideComment) {
  let rest = line;
  let kept = '';
  let inside = insideComment;
  while (rest !== '') {
    if (inside) {
      const close = rest.indexOf('-->');
      if (close < 0) return { kept, inside: true };
      rest = rest.slice(close + 3);
      inside = false;
      kept += ` ${BREAK} `;
    } else {
      const open = rest.indexOf('<!--');
      if (open < 0) return { kept: kept + rest, inside: false };
      kept += rest.slice(0, open);
      rest = rest.slice(open + 4);
      inside = true;
    }
  }
  return { kept, inside };
}

function proseOfLine(line) {
  if (LINK_DEFINITION.test(line)) return BREAK;
  return line
    .replace(INLINE_CODE, ` ${BREAK} `)
    .replace(IMAGE_OR_LINK, '$1')
    .replace(URL, ` ${BREAK} `);
}

function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== '---') return 0;
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return close < 0 ? 0 : close + 1;
}

// The words of a file in order, each with its line and the run it belongs to.
function extractWords(text) {
  const lines = text.split(/\r?\n/);
  const inFrontmatter = frontmatterEnd(lines);
  const words = [];
  let run = 0;
  let fence = null;
  let insideComment = false;
  const pushTokens = (tokens, lineNumber) => {
    for (const token of tokens) {
      if (token === BREAK) run += 1;
      else words.push({ word: token, line: lineNumber, run });
    }
  };
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const fenceMark = line.match(FENCE)?.[1];
    if (fence !== null || fenceMark) {
      if (fence === null) fence = fenceMark;
      else if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = null;
      run += 1;
      return;
    }
    const { kept, inside } = stripComments(line, insideComment);
    insideComment = inside;
    let prose = kept;
    if (index < inFrontmatter) {
      if (index === 0 || index === inFrontmatter - 1) prose = BREAK;
      else prose = prose.replace(FRONTMATTER_KEY, ` ${BREAK} `);
    }
    pushTokens(lineTokens(proseOfLine(prose)), lineNumber);
  });
  return words;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function gramAt(words, start) {
  const end = start + GRAM_LENGTH - 1;
  if (end >= words.length || words[start].run !== words[end].run) return null;
  return words.slice(start, end + 1).map((entry) => entry.word).join(' ');
}

function loadFile(file, label) {
  return { label, words: extractWords(fs.readFileSync(file, 'utf8')) };
}

function sourceFiles(sourceDirs) {
  const files = [];
  for (const dir of sourceDirs) {
    const base = path.basename(path.resolve(dir));
    for (const file of walkMarkdown(dir)) {
      files.push(loadFile(file, `${base}/${toPosix(path.relative(dir, file))}`));
    }
  }
  return files;
}

function indexGrams(files) {
  const index = new Map();
  files.forEach((file, fileIndex) => {
    for (let position = 0; position < file.words.length; position += 1) {
      const gram = gramAt(file.words, position);
      if (gram === null) continue;
      const hits = index.get(gram);
      if (hits) hits.push({ fileIndex, position });
      else index.set(gram, [{ fileIndex, position }]);
    }
  });
  return index;
}

// Hits that stay aligned in both files from one gram to the next grow one span.
function spansOfFile(exoFile, index) {
  const spans = [];
  let open = new Map();
  for (let position = 0; position < exoFile.words.length; position += 1) {
    const gram = gramAt(exoFile.words, position);
    const next = new Map();
    for (const hit of (gram === null ? [] : index.get(gram) ?? [])) {
      const key = `${hit.fileIndex}:${hit.position - position}`;
      const span = open.get(key) ?? { fileIndex: hit.fileIndex, exoStart: position, sourceStart: hit.position };
      if (!open.has(key)) spans.push(span);
      span.exoLastGram = position;
      next.set(key, span);
    }
    open = next;
  }
  return spans;
}

function describeSpan(exoFile, span, sources) {
  const source = sources[span.fileIndex];
  const matched = exoFile.words.slice(span.exoStart, span.exoLastGram + GRAM_LENGTH);
  return {
    exoPath: exoFile.label,
    exoLine: exoFile.words[span.exoStart].line,
    sourcePath: source.label,
    sourceLine: source.words[span.sourceStart].line,
    words: matched.map((entry) => entry.word).join(' ')
  };
}

// A phrase repeated inside one source file is reported once, at its first place.
function uniqueBySource(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.exoPath}:${record.exoLine}:${record.words}:${record.sourcePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findOverlaps(sourceDirs) {
  const sources = sourceFiles(sourceDirs);
  const index = indexGrams(sources);
  const records = [];
  for (const dir of EXO_DIRS) {
    for (const file of walkMarkdown(path.join(ROOT, dir))) {
      const exoFile = loadFile(file, toPosix(path.relative(ROOT, file)));
      for (const span of spansOfFile(exoFile, index)) records.push(describeSpan(exoFile, span, sources));
    }
  }
  records.sort((left, right) => left.exoPath.localeCompare(right.exoPath)
    || left.exoLine - right.exoLine
    || left.sourcePath.localeCompare(right.sourcePath)
    || left.sourceLine - right.sourceLine);
  return uniqueBySource(records);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const sourceDirs = args.filter((arg) => arg !== '--json');
  const missing = sourceDirs.filter((dir) => !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory());
  if (sourceDirs.length === 0 || missing.length > 0) {
    if (missing.length > 0) console.error(`not a directory: ${missing.join(', ')}`);
    console.error('usage: phrase-overlap.mjs [--json] <source-dir>...');
    process.exitCode = USAGE_EXIT;
    return;
  }
  const records = findOverlaps(sourceDirs);
  if (asJson) {
    console.log(JSON.stringify(records, null, 2));
  } else {
    for (const record of records) {
      console.log(`${record.exoPath}:${record.exoLine}  ${record.sourcePath}:${record.sourceLine}  "${record.words}"`);
    }
    console.log(`TOTAL ${records.length}`);
  }
  process.exitCode = records.length > 0 ? 1 : 0;
}

main();
