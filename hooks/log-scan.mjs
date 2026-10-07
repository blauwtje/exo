#!/usr/bin/env node
// PostToolUse hook on Bash and Read, switched by the `log_scan` setting (off
// by default). It fires when a Bash command names, or a Read opens, a regular
// file of 200 lines or more that reads as a log, never on how long an output
// is. Then it adds a note of at most 5 lines: the line count, the count per
// level, and the 3 most common message templates (digits and tokens holding
// digits masked) each with its count and first and last line number. Templates
// of warn lines and worse rank first when the file has any, since a debug
// line repeated per row says little. A log is a file where half its non-empty
// lines start with a level, after an optional timestamp. The hook reads at
// most 2 MiB of a file, checks at most 8 words of a command, and keeps silent
// on every fault: a scan never blocks the tool call and never exits 2.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { isProcessEntry } from './guards/guard-runner.mjs';

const MIN_LINES = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WORDS = 8;
const TOP = 3;
const TEMPLATE_WIDTH = 90;
const ORDER = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const SEVERE = new Set(['WARN', 'ERROR', 'FATAL']);
const LINE = /^\s*(?:\[?\d{4}-\d\d-\d\d[T ][\d:.,]+(?:Z|[+-]\d\d:?\d\d)?\]?\s+)?\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]?:?\s+(.*)$/;

// The files a hook input names: a Read's path, or the words of a Bash command
// that are not options, with quotes, redirects and separators stripped.
function candidates(hookInput) {
  const input = hookInput.tool_input ?? {};
  const base = typeof hookInput.cwd === 'string' ? hookInput.cwd : process.cwd();
  let words = [];
  if (hookInput.tool_name === 'Read') words = [input.file_path];
  else if (hookInput.tool_name === 'Bash' && typeof input.command === 'string') {
    words = input.command.split(/[\s;|&<>()]+/).map((word) => word.replace(/^['"]+|['"]+$/g, '')).filter((word) => word !== '' && !word.startsWith('-'));
  }
  return words.filter((word) => typeof word === 'string' && word !== '').slice(0, MAX_WORDS).map((word) => path.resolve(base, word));
}

// The text of a regular file up to the byte cap, whole lines only when the
// cap cut it, or null for anything else. The open does not block on a pipe.
function readRegularFile(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0) return null;
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_BYTES));
    let filled = 0;
    while (filled < buffer.length) {
      const count = fs.readSync(descriptor, buffer, filled, buffer.length - filled, filled);
      if (count === 0) break;
      filled += count;
    }
    const truncated = stat.size > MAX_BYTES;
    let text = buffer.toString('utf8', 0, filled);
    if (truncated) text = text.slice(0, text.lastIndexOf('\n') + 1);
    return { text, truncated };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

const mask = (message) => message.replace(/[\w.:/-]*\d[\w.:/-]*/g, '#');

// The note for `text`, or null when it is not a log of enough lines.
export function logNote(name, { text, truncated }) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < MIN_LINES) return null;
  const levels = new Map();
  const templates = new Map();
  let leveled = 0;
  let nonEmpty = 0;
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    nonEmpty += 1;
    const match = LINE.exec(line);
    if (!match) return;
    leveled += 1;
    const level = match[1] === 'WARNING' ? 'WARN' : match[1];
    levels.set(level, (levels.get(level) ?? 0) + 1);
    const key = `${level}\n${mask(match[2])}`;
    const seen = templates.get(key);
    if (seen) {
      seen.count += 1;
      seen.last = index + 1;
    } else templates.set(key, { level, message: mask(match[2]), count: 1, first: index + 1, last: index + 1 });
  });
  if (leveled * 2 < nonEmpty) return null;
  const all = [...templates.values()];
  const severe = all.filter((template) => SEVERE.has(template.level));
  const top = (severe.length > 0 ? severe : all).sort((a, b) => b.count - a.count || a.first - b.first).slice(0, TOP);
  const perLevel = [...levels].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([level, count]) => `${level} ${count}`).join(', ');
  const header = `exo log scan: ${name} has ${lines.length}${truncated ? '+' : ''} lines (${perLevel}).`;
  const rows = top.map((template) => {
    const message = template.message.length > TEMPLATE_WIDTH ? `${template.message.slice(0, TEMPLATE_WIDTH)}...` : template.message;
    return `${template.count}x ${template.level} "${message}", first line ${template.first}, last line ${template.last}`;
  });
  return [header, ...rows].join('\n');
}

export function scanLog(hookInput) {
  if (hookInput?.tool_name !== 'Bash' && hookInput?.tool_name !== 'Read') return null;
  if (settingValue('log_scan') !== 'on') return null;
  for (const file of candidates(hookInput)) {
    const content = readRegularFile(file);
    const note = content && logNote(path.basename(file), content);
    if (note) return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } };
  }
  return null;
}

if (isProcessEntry(import.meta.url)) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : scanLog(JSON.parse(text));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // A scan fault leaves the tool call as it was.
  }
}
