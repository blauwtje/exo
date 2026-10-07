#!/usr/bin/env node
// PostToolUse hook on Edit, switched by the `sibling_scan` setting (off by
// default). After an Edit that removes lines it adds a note of at most 5 lines
// naming where the same fault may still sit: the tracked files that still hold
// a removed line verbatim, and, when a removed line mutated a module-level
// binding of a JavaScript or TypeScript file, the other module-level bindings
// that functions mutate (a Map, Set, array, object or `let` shared across
// calls). The edit text is untrusted: it goes to `git` only as an argument
// array after `-F -e` and before `--`, never through a shell. The hook reads
// at most 500 tracked files of 256 KiB each and keeps silent on every fault:
// a scan never blocks the tool call and never exits 2.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { isProcessEntry } from './guards/guard-runner.mjs';

const MIN_LINE = 12;
const MAX_LINES = 10;
const MAX_COMMON = 8;
const MAX_LISTED = 8;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 256 * 1024;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const NAME = '[A-Za-z_$][\\w$]*';
const MUTATORS = 'set|add|push|pop|shift|unshift|splice|delete|clear|sort|reverse|fill';
const ASSIGN = new RegExp(`^\\s*(?:return\\s+)?(${NAME})(?:\\.${NAME}|\\[[^\\]]*\\])*\\s*(?:\\*\\*|\\?\\?|\\|\\||&&|[-+*/%|&^])?=(?![=>])`);
const CALL = new RegExp(`\\b(${NAME})(?:\\.${NAME})*\\.(?:${MUTATORS})\\(`, 'g');
const OBJECT_ASSIGN = new RegExp(`\\bObject\\.assign\\(\\s*(${NAME})\\s*[,)]`, 'g');
const STEP = new RegExp(`(?:\\+\\+|--)(${NAME})\\b|\\b(${NAME})(?:\\+\\+|--)`, 'g');

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout: 3000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
    });
  } catch {
    return '';
  }
};

// The names a line writes to: assignment, a mutating method, Object.assign, ++.
export function mutatedNames(line) {
  const names = new Set();
  const assigned = ASSIGN.exec(line);
  if (assigned) names.add(assigned[1]);
  for (const pattern of [CALL, OBJECT_ASSIGN, STEP]) {
    for (const match of line.matchAll(pattern)) names.add(match[1] ?? match[2]);
  }
  return names;
}

// The trimmed lines of `before` that `after` no longer holds, trivial ones left out.
export function removedLines(before, after) {
  const kept = new Map();
  for (const line of after.split('\n')) kept.set(line.trim(), (kept.get(line.trim()) ?? 0) + 1);
  const removed = new Set();
  for (const raw of before.split('\n')) {
    const line = raw.trim();
    if (kept.get(line) > 0) kept.set(line, kept.get(line) - 1);
    else if (line.length >= MIN_LINE && /[A-Za-z]/.test(line)) removed.add(line);
  }
  return [...removed].slice(0, MAX_LINES);
}

const declaresModuleLevel = (text, name) => new RegExp(
  `^(?:export\\s+)?(?:(?:async\\s+)?function\\*?|class|let|var|const)\\s+${name.replace(/\$/g, '\\$')}\\b|^import\\b[^\\n]*\\b${name.replace(/\$/g, '\\$')}\\b`, 'm'
).test(text);

// The module-level let, var and const names of `text` that an indented line mutates.
export function sharedBindings(text) {
  const declared = new Set();
  for (const match of text.matchAll(new RegExp(`^(?:export\\s+)?(?:let|var|const)\\s+(${NAME})`, 'gm'))) declared.add(match[1]);
  const mutated = new Set();
  for (const line of text.split('\n')) {
    if (!/^\s/.test(line)) continue;
    for (const name of mutatedNames(line)) if (declared.has(name)) mutated.add(name);
  }
  return [...mutated];
}

function trackedSources(root) {
  const files = git(root, ['ls-files', '--full-name', '-z', '--', ':/']).split('\0').filter((file) => SOURCE.test(file));
  return files.slice(0, MAX_FILES);
}

const readSmall = (file) => {
  try {
    return fs.statSync(file).size <= MAX_FILE_BYTES ? fs.readFileSync(file, 'utf8') : '';
  } catch {
    return '';
  }
};

const more = (list, limit) => `${list.slice(0, limit).join(', ')}${list.length > limit ? `, +${list.length - limit} more` : ''}`;

// The note for an Edit of `file` from `before` to `after`, or null.
export function siblingNote(file, before, after) {
  const removed = removedLines(before, after);
  if (removed.length === 0) return null;
  const root = git(path.dirname(file), ['rev-parse', '--show-toplevel']).trim();
  if (root === '') return null;
  const holders = new Set();
  for (const line of removed) {
    const hits = git(root, ['grep', '-l', '-F', '-e', line, '--', ':/']).split('\n').filter(Boolean);
    if (hits.length <= MAX_COMMON) hits.forEach((hit) => holders.add(hit));
  }
  const rows = [`exo sibling scan: this edit removed ${removed.length} line${removed.length === 1 ? '' : 's'}; check where else the fault sits.`];
  if (holders.size > 0) rows.push(`Still holding a removed line verbatim: ${more([...holders].sort(), MAX_LISTED)}.`);
  const own = fs.existsSync(file) ? readSmall(file) : '';
  const edited = path.relative(root, file);
  const targets = SOURCE.test(file)
    ? [...new Set(removed.flatMap((line) => [...mutatedNames(line)]))].filter((name) => declaresModuleLevel(own, name))
    : [];
  if (targets.length > 0) {
    const others = [];
    for (const source of trackedSources(root)) {
      const names = sharedBindings(readSmall(path.join(root, source))).filter((name) => source !== edited || !targets.includes(name));
      if (names.length > 0) others.push(`${source} (${names.join(', ')})`);
    }
    if (others.length > 0) {
      rows.push(`The removed code mutated module-level ${targets.join(', ')}. Other module-level bindings that functions mutate: ${more(others, MAX_LISTED)}.`);
    }
  }
  return rows.length > 1 ? rows.join('\n') : null;
}

export function scanSiblings(hookInput) {
  if (hookInput?.tool_name !== 'Edit' || settingValue('sibling_scan') !== 'on') return null;
  const { file_path: filePath, old_string: before, new_string: after } = hookInput.tool_input ?? {};
  if (typeof filePath !== 'string' || typeof before !== 'string' || typeof after !== 'string') return null;
  const base = typeof hookInput.cwd === 'string' ? hookInput.cwd : process.cwd();
  const note = siblingNote(path.resolve(base, filePath), before, after);
  return note ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } } : null;
}

if (isProcessEntry(import.meta.url)) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : scanSiblings(JSON.parse(text));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // A scan fault leaves the tool call as it was.
  }
}
