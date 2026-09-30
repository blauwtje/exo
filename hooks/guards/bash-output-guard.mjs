#!/usr/bin/env node
// PreToolUse guard on Bash: keeps a long command output out of the context
// window by denying two shapes and naming the bounded form to run instead.
//   1. A known-verbose build, test or log command with no pipe, redirect,
//      chain or substitution, which prints its whole output; the deny gives
//      the same command capped by `tail -n 200`.
//   2. A whole-file read through the shell (`cat FILE`, `sed` without a range
//      under 300 lines, `head` past 300 lines) of a file over the byte cap,
//      the Bash counterpart of the Read guard; `READ_GUARD_MAX_BYTES` sets the
//      cap (default 12000). Paths under `${CLAUDE_PLUGIN_ROOT}` and the config
//      directory (`~/.claude`) are exempt, and so is a pipeline whose later stage bounds the
//      output (head, tail, wc, grep and the checksum tools).
// The guard only denies and never rewrites a command. `guards: off` switches
// it off. A fault, or a command it cannot tokenise, lets the command through.
// Ceiling: `cd` is followed by its literal argument and a shell variable in a
// path reads as written.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { blankCommandText } from './command-text.mjs';
import { runBashGuard } from './guard-runner.mjs';

const MAX_LINES = 300;
const DEFAULT_MAX_BYTES = 12_000;
const TAIL_LINES = 200;
const BYTES_PER_TOKEN = 4;
const BOUNDING_STAGES = new Set(['head', 'tail', 'wc', 'grep', 'rg', 'shasum', 'md5', 'sha256sum']);
const SEPARATORS = new Set(['|', '||', '&&', ';', '&']);
const PUNCTUATION = '();<>|&';
const RANGE_SCRIPT = /^(\d+),(\d+|\$)p$/;

// The patterns match on prefix, so every runner form is spelled out: a bare
// `pytest` and `uv run pytest` are different strings, and `git -C <dir> log`
// does not start with `git log`.
const VERBOSE_COMMAND = new RegExp(
  '^(?:npm test|npm run test|npm run build|pnpm test|pnpm build|yarn test|bun test' +
    '|pytest|python -m pytest|python3 -m pytest|uv run pytest' +
    '|go test|cargo test|cargo build|cargo clippy|dotnet test|dotnet build' +
    '|tsc|npx tsc|git log|git -C \\S+ log|git shortlog)'
);
const CHAINED = /[|><&;`\n]|\$\(/;
const GIT_COUNT_LIMIT = /\s(?:-n\s*\d+|-\d+|--max-count[= ]\d+)(?:\s|$)/;

// Splits a command into segments of words, each with the separator that joined
// it to the one before. Quotes and backslashes group words the way a shell
// does; a newline separates like `;`. Throws on an unterminated quote.
function splitSegments(command) {
  const segments = [];
  let words = [];
  let joinedBy = null;
  let word = '';
  let inWord = false;

  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endSegment = (separator) => {
    endWord();
    if (words.length > 0) segments.push({ joinedBy, words });
    words = [];
    joinedBy = separator;
  };

  for (let position = 0; position < command.length; position += 1) {
    const character = command[position];
    if (character === "'") {
      const end = command.indexOf("'", position + 1);
      if (end === -1) throw new Error('unterminated quote');
      word += command.slice(position + 1, end);
      inWord = true;
      position = end;
    } else if (character === '"') {
      position += 1;
      inWord = true;
      while (command[position] !== '"') {
        if (position >= command.length) throw new Error('unterminated quote');
        const escaped = command[position] === '\\' && '"\\$`'.includes(command[position + 1]);
        if (escaped) position += 1;
        word += command[position];
        position += 1;
      }
    } else if (character === '\\') {
      word += command[position + 1] ?? '';
      inWord = true;
      position += 1;
    } else if (character === '\n') {
      endSegment(';');
    } else if (PUNCTUATION.includes(character)) {
      endWord();
      let operator = character;
      while (PUNCTUATION.includes(command[position + 1] ?? '')) {
        position += 1;
        operator += command[position];
      }
      if (SEPARATORS.has(operator)) endSegment(operator);
      else words.push(operator);
    } else if (/\s/.test(character)) {
      endWord();
    } else {
      word += character;
      inWord = true;
    }
  }
  endSegment(null);
  return segments;
}

// The plugin's own files and the harness config directory are read whole.
function isExempt(file) {
  const roots = [configDirectory(), process.env.CLAUDE_PLUGIN_ROOT].filter(Boolean);
  return roots.some((root) => file.startsWith(path.resolve(root) + path.sep));
}

function maxBytesFor(file) {
  if (isExempt(file)) return 0;
  return Number(process.env.READ_GUARD_MAX_BYTES ?? DEFAULT_MAX_BYTES);
}

function homeExpanded(word) {
  if (word === '~' || word.startsWith('~/')) return path.join(process.env.HOME ?? '', word.slice(1));
  return word;
}

// The first word over the byte cap that names a file, else null.
function largeFile(words, directory) {
  for (const word of words) {
    if (word.startsWith('-')) continue;
    const file = path.resolve(directory, homeExpanded(word));
    let size;
    try {
      const stats = fs.statSync(file);
      if (!stats.isFile()) continue;
      size = stats.size;
    } catch {
      continue;
    }
    const cap = maxBytesFor(file);
    if (cap > 0 && size > cap) return { file, size, cap };
  }
  return null;
}

// The largest line count `head` is asked for: `-n N`, `-nN` or `-N`.
function headLines(args) {
  let requested = 0;
  args.forEach((word, position) => {
    if (word === '-n' && /^\d+$/.test(args[position + 1] ?? '')) requested = Number(args[position + 1]);
    else if (/^-n?\d+$/.test(word)) requested = Number(word.replace(/^-n?/, ''));
  });
  return requested;
}

function hasBoundedRange(args) {
  if (!args.includes('-n')) return false;
  return args.some((word) => {
    const match = RANGE_SCRIPT.exec(word);
    return match !== null && match[2] !== '$' && Number(match[2]) - Number(match[1]) < MAX_LINES;
  });
}

// What a segment reads whole and how, as { file, size, cap, what }, else null.
function wholeFileRead(words, directory) {
  const [command, ...args] = words;
  if (command === 'cat') {
    const hit = largeFile(args, directory);
    return hit && { ...hit, what: 'cat' };
  }
  if (command === 'sed') {
    if (hasBoundedRange(args)) return null;
    const hit = largeFile(args, directory);
    return hit && { ...hit, what: `sed without a range under ${MAX_LINES} lines` };
  }
  if (command === 'head') {
    const requested = headLines(args);
    if (requested <= MAX_LINES) return null;
    const hit = largeFile(args, directory);
    return hit && { ...hit, what: `head of ${requested} lines` };
  }
  return null;
}

function boundedDownstream(segments, index) {
  const next = segments[index + 1];
  if (next?.joinedBy !== '|') return false;
  return BOUNDING_STAGES.has(next.words[0]);
}

function readDenial(command, startDirectory) {
  const segments = splitSegments(command);
  let directory = startDirectory;
  for (const [index, { words }] of segments.entries()) {
    if (words[0] === 'cd' && words.length > 1) {
      directory = path.resolve(directory, homeExpanded(words[1]));
      continue;
    }
    const hit = wholeFileRead(words, directory);
    if (!hit || boundedDownstream(segments, index)) continue;
    return (
      `${hit.what} on ${hit.file}: ${hit.size} bytes (>${hit.cap}, about ${Math.floor(hit.size / BYTES_PER_TOKEN)} tokens). ` +
      `Locate the range first with grep -n, then read only that range with sed -n 'A,Bp' under ${MAX_LINES} lines, or pipe into head.`
    );
  }
  return null;
}

function outputDenial(command) {
  const written = blankCommandText(command).trim();
  if (CHAINED.test(written) || !VERBOSE_COMMAND.test(written)) return null;
  if (/^git\b/.test(written) && GIT_COUNT_LIMIT.test(written)) return null;
  return (
    `\`${command.trim()}\` can print a whole build, test or log output into the context window. ` +
    `Run it capped, keeping its exit status: set -o pipefail; ${command.trim()} 2>&1 | tail -n ${TAIL_LINES}`
  );
}

await runBashGuard((command, hookInput) => readDenial(command, hookInput.cwd || process.cwd()) ?? outputDenial(command));
