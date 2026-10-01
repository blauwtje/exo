#!/usr/bin/env node
// PreToolUse guard on Bash: denies a shell read of a path that the `Read(...)`
// entries under `permissions.deny` protect. Those entries bind only the Read
// tool, so `cat .env` would otherwise walk around them. The globs come from the
// user settings file in the config directory and from `.claude/settings.json`
// and `.claude/settings.local.json` in the project.
// Stands down when the `guards` setting is `off`.
//
// A glob follows the Read rule forms: `//abs` is absolute, `~/x` is under the
// home directory, `/x` is under the project root, `./x` is under the hook's
// working directory, and a bare `x` with no slash matches that name at any depth.
// `**` crosses directories, `*` and `?` stay inside one.
//
// A read is a word after a reader command (`cat`, `head`, `grep`, `cp`, `tar`,
// `dd if=` and the like), a `curl` upload (`-T file`, `@file`) or after `<`. A word
// with `*` or `?` is expanded against the working directory first, and a dotfile
// matches only a pattern that spells its dot, as in the shell; `[...]` and `{...}`
// are not expanded. A directory word is a read of what it holds, so a
// recursive `grep` of a protected directory is denied.
// Ceiling: the command string is tokenised, not run. Every operand of a reader
// counts as a file, so `grep .env README.md` with a `Read(./.env)` rule is denied
// as well; spell such a pattern so it differs from the path. `cd` is not followed, a
// command name or path assembled from variables other than a leading `$HOME`
// reads as written, and a reader behind `xargs`, `find -exec` or `sh -c` is not
// seen, and a `$(...)` in single quotes reads as a run; list the command in the deny rules of the settings file to cover it.
// A settings file that cannot be read is skipped and named on stderr when no other
// file yields a denial. A fault reading the input exits 0 with no output; the
// guard never exits 2.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { projectRoot, readLayer } from '#settings-store';
import { isProcessEntry, runBashGuard } from './guard-runner.mjs';

const READERS = new Set([
  'cat', 'tac', 'nl', 'head', 'tail', 'less', 'more', 'bat', 'sed', 'awk', 'gawk',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'cut', 'sort', 'uniq', 'paste', 'column', 'fold', 'rev',
  'strings', 'xxd', 'od', 'hexdump', 'base64', 'jq', 'yq', 'diff', 'cmp', 'cp', 'mv', 'scp', 'zip', 'tar', 'dd', 'source', '.'
]);
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'nice', 'time', 'env']);
const READ_RULE = /^Read\((.*)\)$/;
const TOKEN = /\n|(?:'[^']*'|"(?:\\.|[^"\\])*"|\\.|[^\s;&|()<>'"\\])+|[;&|()]+|<+|>+/g;
const QUOTED_PART = /'([^']*)'|"((?:\\.|[^"\\])*)"|\\(.)/g;
const SUBSTITUTION = /\$\(([^()]*)\)|`([^`]*)`/g;
const ASSIGNMENT =/^[A-Za-z_]\w*=/;

function unquote(token) {
  return token.replace(QUOTED_PART, (whole, single, double, escaped) => single ?? double?.replace(/\\(.)/g, '$1') ?? escaped);
}

// Splits a command into segments of words at `; & | ( )` and newlines. A `<`
// puts its file word into `redirected`; a `>` drops the word it writes to.
function wordSegments(command) {
  const segments = [];
  let words = [];
  let redirected = [];
  let operator = null;
  const endSegment = () => {
    if (words.length > 0 || redirected.length > 0) segments.push({ words, redirected });
    words = [];
    redirected = [];
  };
  for (const [token] of command.matchAll(TOKEN)) {
    if (token === '\n' || /^[;&|()]/.test(token)) {
      endSegment();
      operator = null;
    } else if (/^[<>]/.test(token)) {
      operator = token;
    } else {
      if (operator === '<') redirected.push(unquote(token));
      else if (operator === null) words.push(unquote(token));
      operator = null;
    }
  }
  endSegment();
  return segments;
}

// A `$(...)` or backtick substitution inside a double-quoted string runs, and
// the word split above reads the string as one word, so each substitution body
// is split again.
function readSegments(command) {
  const segments = wordSegments(command);
  for (const match of command.matchAll(SUBSTITUTION)) segments.push(...readSegments(match[1] ?? match[2]));
  return segments;
}

// The words a segment reads: its arguments when its command is a reader, and
// every `<` file.
function readWords({ words, redirected }) {
  let start = 0;
  while (start < words.length && (ASSIGNMENT.test(words[start]) || WRAPPERS.has(words[start]))) start += 1;
  const isReader = start < words.length && READERS.has(path.basename(words[start]));
  const command = start < words.length ? path.basename(words[start]) : '';
  const rest = words.slice(start + 1);
  if (command === 'curl') return [...curlFiles(rest), ...redirected];
  let operands = isReader ? rest.filter((word) => !word.startsWith('-')) : [];
  if (command === 'dd') operands = operands.map((word) => word.replace(/^if=/, ''));
  return [...operands, ...redirected];
}

// The files a `curl` command sends: `-T file`, `--upload-file file`, and `@file`
// after `-d`, `--data-binary`, `-F name=` and the like.
function curlFiles(args) {
  const files = [];
  for (const [index, word] of args.entries()) {
    const previous = args[index - 1];
    if (previous === '-T' || previous === '--upload-file') files.push(word);
    if (/^-T[^-]/.test(word)) files.push(word.slice(2));
    const attached = /(?:^|=|^-[A-Za-z])@([^;]+)/.exec(word);
    if (attached) files.push(attached[1]);
  }
  return files;
}

function expandHome(word) {
  const home = os.homedir();
  if (word === '~' || word === '$HOME' || word === '${HOME}') return home;
  const match = /^(?:~|\$HOME|\$\{HOME\})\/(.*)$/s.exec(word);
  return match ? path.join(home, match[1]) : word;
}

// Glob matching runs on `/`; on Windows the platform separator is `\`.
function slashed(file) {
  return file.split(path.sep).join('/');
}

function globRegExp(glob) {
  let source = '';
  for (let position = 0; position < glob.length; position += 1) {
    const character = glob[position];
    if (glob.startsWith('**/', position)) {
      source += '(?:.*/)?';
      position += 2;
    } else if (glob.startsWith('**', position)) {
      source += '.*';
      position += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

// The absolute glob a `Read(...)` spec stands for.
function absoluteGlob(spec, directory, root) {
  if (spec.startsWith('//')) return spec.slice(1);
  if (spec.startsWith('~/')) return path.join(os.homedir(), spec.slice(2));
  if (spec.startsWith('/')) return path.join(root, spec.slice(1));
  if (spec.startsWith('./')) return path.join(directory, spec.slice(2));
  return spec.includes('/') ? path.join(directory, spec) : `**/${spec}`;
}

// The `Read(...)` specs of one settings file; a file that is absent has none.
function readSpecs(file) {
  const deny = readLayer(file).permissions?.deny;
  if (!Array.isArray(deny)) return [];
  const specs = [];
  for (const entry of deny) {
    const match = typeof entry === 'string' ? READ_RULE.exec(entry) : null;
    if (match) specs.push(match[1]);
  }
  return specs;
}

function settingsFiles(root) {
  return [
    path.join(configDirectory(), 'settings.json'),
    path.join(root, '.claude', 'settings.json'),
    path.join(root, '.claude', 'settings.local.json')
  ];
}

function protectedRules(directory, root, notes) {
  const rules = [];
  for (const file of settingsFiles(root)) {
    let specs;
    try {
      specs = readSpecs(file);
    } catch (error) {
      notes.push(`secret-guard: cannot read the deny rules in ${file}: ${error.message}`);
      continue;
    }
    for (const spec of specs) rules.push({ spec, pattern: globRegExp(slashed(absoluteGlob(spec, directory, root))) });
  }
  return rules;
}

// The paths a glob word names in `directory`; a word without `*` or `?` names none.
function expandGlob(word, directory) {
  if (!/[*?]/.test(word)) return [];
  const absolute = path.resolve(directory, expandHome(word));
  const { root } = path.parse(absolute);
  let paths = [root];
  for (const segment of absolute.slice(root.length).split(path.sep)) {
    const next = [];
    for (const base of paths) {
      if (!/[*?]/.test(segment)) {
        next.push(path.join(base, segment));
        continue;
      }
      let names = [];
      try {
        names = fs.readdirSync(base);
      } catch {
        continue;
      }
      const pattern = globRegExp(segment);
      const hidden = /^[*?]/.test(segment);
      for (const name of names) {
        if (pattern.test(name) && !(hidden && name.startsWith('.'))) next.push(path.join(base, name));
      }
    }
    paths = next;
  }
  return paths;
}

// The first rule that protects the word's path, or what lies under it.
function matchingRule(word, directory, rules) {
  const file = path.resolve(directory, expandHome(word));
  const under = slashed(path.join(file, 'x'));
  return rules.find(({ pattern }) => pattern.test(slashed(file)) || pattern.test(under));
}

function denialReason(command, directory, rules) {
  for (const segment of readSegments(command)) {
    for (const word of readWords(segment)) {
      const rule = [word, ...expandGlob(word, directory)]
        .map((candidate) => matchingRule(candidate, directory, rules))
        .find(Boolean);
      if (rule) {
        return `secret-guard: ${word} is protected by the deny rule Read(${rule.spec}), and a shell read walks around it. Do not read it; ask the user for the value or the part you need.`;
      }
    }
  }
  return null;
}

export function denialFor(command, hookInput = {}) {
  const directory = hookInput.cwd || process.cwd();
  const notes = [];
  const rules = protectedRules(directory, projectRoot(), notes);
  const reason = denialReason(command, directory, rules);
  if (!reason && notes.length > 0) process.stderr.write(`${notes.join('\n')}\n`);
  return reason;
}

if (isProcessEntry(import.meta.url)) await runBashGuard(denialFor);
