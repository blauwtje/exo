// Bash guard: denies a shell read of a path a `Read(...)` rule under
// `permissions.deny` protects (user, project and local settings), since those
// rules bind only the Read tool. Globs follow the Read rule forms (`//abs`,
// `~/x`, `/x` from the project root, `./x`, bare `x` at any depth). A read is an
// operand of a reader command, a `curl` upload or a `<` file; a glob word is
// expanded first, and a directory word reads what it holds.
// Ceiling: tokenised, not run: every reader operand counts as a file, `cd` is
// not followed, and a reader behind `xargs` or `find -exec` is not seen. An
// unreadable settings file is skipped and named on stderr.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { projectRoot, readLayer } from '#settings-store';

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

// Word segments split at `; & | ( )` and newlines; `<` files go to `redirected`, `>` targets drop.
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

// A substitution inside a double-quoted string runs, so its body is split again.
function readSegments(command) {
  const segments = wordSegments(command);
  for (const match of command.matchAll(SUBSTITUTION)) segments.push(...readSegments(match[1] ?? match[2]));
  return segments;
}

// The words a segment reads: a reader's operands and every `<` file.
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

// The files `curl` sends: `-T file`, `--upload-file file` and `@file` data.
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

// Glob matching runs on `/`, not the Windows `\`.
const slashed = (file) => file.split(path.sep).join('/');

// `**/`, `**`, `*` and `?` become their patterns; any other regex character is escaped.
const GLOB_TOKEN = /\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g;
const GLOB_PATTERNS = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' };

function globRegExp(glob) {
  return new RegExp(`^${glob.replace(GLOB_TOKEN, (token) => GLOB_PATTERNS[token] ?? `\\${token}`)}$`);
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
  return deny.map((entry) => (typeof entry === 'string' ? READ_RULE.exec(entry)?.[1] : undefined)).filter((spec) => spec !== undefined);
}

function protectedRules(directory, root, notes) {
  const rules = [];
  const files = [path.join(configDirectory(), 'settings.json'), path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json')];
  for (const file of files) {
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
      let names;
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
