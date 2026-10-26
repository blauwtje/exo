import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { CODE_EXTENSIONS, commentFindings, commentSpans } from '#code-comments';

const MAX_DEPTH = 2;
const MAX_PARAMS = 3;
const MAX_LENGTH = 20;
export const CODE_RULE_LIMITS = `added code keeps every code rule: blocks nest at most ${MAX_DEPTH} deep, a function takes at most ${MAX_PARAMS} parameters, no nested ternary, no else after return, no comment`;
const ESLINT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);
const FAIL_RULES = new Set(['max-depth', 'max-params', 'no-nested-ternary', 'no-else-return', 'no-empty', 'no-unused-vars', 'space-infix-ops', 'comma-spacing']);
const STRING_LITERAL = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/;
const REGEX_LITERAL = /(?<=(?:^|[(,=:\[!&|?{};]|\breturn)\s*)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/;
const LITERAL = new RegExp(`${STRING_LITERAL.source}|${REGEX_LITERAL.source}`, 'gm');
const UNEVEN_EQUALS = /\s=[^\s=>]|[^\s=!<>+\-*\/%&|^?]=\s/;
const BARE_COMMA = /,(?![\s,)\]}]|$)/;
const CATCH_BLOCK = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
const LOG_STATEMENT = /^(?:console|logger|log)\.\w+\(/;
const WARN_RULES = new Set(['max-lines-per-function']);
const ESLINT_RULES = [
  'max-depth:[error,2]',
  'max-params:[error,3]',
  'no-nested-ternary:error',
  'no-else-return:error',
  'no-empty:error',
  'no-unused-vars:error',
  'max-lines-per-function:[warn,{max:20,skipBlankLines:true,skipComments:true}]',
];
const PROJECT_CONFIG = /^(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.\w+)?)$/;
const CONTROL = /^(?:\}\s*)?(?:if|else|elif|for|foreach|while|switch|try|catch|finally|except|with|match|do|case|default)\b/;
const FUNCTION_PARAMS = [
  /\b(?:function\*?|def|fn|func)\s*[\w$]*\s*\(([^)]*)\)/,
  /\(([^()]*)\)\s*(?::\s*[^=]+)?=>/,
  /^\s*(?:(?:async|static|public|private|protected)\s+)*[\w$]+\s*\(([^()]*)\)\s*(?::\s*[\w<>[\]|. ]+)?\s*\{\s*$/,
];
const BARE_ARROW = /^\s*(?:const|let|var)?\s*[\w$.]*\s*=?\s*(?:async\s+)?[\w$]+\s*=>/;
const NOT_A_METHOD = /^\s*(?:if|for|while|switch|catch|return|with|function)\b/;
const COMMENT_LINE = /^\s*(?:\/\/|#|\*|\/\*|--)/;

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function allLines(text) {
  return new Set(text.split('\n').map((_, index) => index + 1));
}

function hunkLines(diff) {
  const added = new Set();
  for (const match of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line++) added.add(line);
  }
  return added;
}

function addedLines(root, base, path, text) {
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', path]).trim();
  if (untracked) return allLines(text);
  return hunkLines(git(root, ['diff', '--unified=0', '--no-color', '--no-ext-diff', base, '--', path]));
}

function depthIndent(line) {
  return line.length - line.trimStart().length;
}

function splitParams(params) {
  const parts = [''];
  let level = 0;
  for (const ch of params) {
    if ('([{'.includes(ch)) level++;
    else if (')]}'.includes(ch)) level--;
    if (ch === ',' && level === 0) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function headerParams(line) {
  if (CONTROL.test(line.trim())) return null;
  for (const pattern of FUNCTION_PARAMS) {
    const match = pattern.exec(line);
    if (match && !(pattern === FUNCTION_PARAMS[2] && NOT_A_METHOD.test(line))) return match[1];
  }
  return BARE_ARROW.test(line) ? 'one' : null;
}

function paramCount(params) {
  if (params === 'one') return 1;
  return splitParams(params).filter((name) => !/^(?:self|cls)\b/.test(name)).length;
}

function bodyLength(lines, header) {
  const indent = depthIndent(lines[header]);
  let count = 1;
  for (let index = header + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (depthIndent(line) <= indent) return /^\s*[})\]]/.test(line) ? count + 1 : count;
    if (!COMMENT_LINE.test(line)) count++;
  }
  return count;
}

function structureFindings(text, added) {
  const lines = text.split('\n');
  const findings = [];
  const stack = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || COMMENT_LINE.test(line) || /^[})\];,]+$/.test(trimmed)) return;
    const indent = depthIndent(line);
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const params = headerParams(line);
    const number = index + 1;
    if (params !== null) {
      stack.push({ indent, fn: true });
      if (!added.has(number)) return;
      const count = paramCount(params);
      if (count > MAX_PARAMS) findings.push({ line: number, rule: 'max-params', text: `takes ${count} parameters, at most ${MAX_PARAMS}`, fail: true });
      const length = bodyLength(lines, index);
      if (length > MAX_LENGTH) findings.push({ line: number, rule: 'max-lines-per-function', text: `is ${length} lines, at most ${MAX_LENGTH}`, fail: false });
      return;
    }
    if (!CONTROL.test(trimmed)) return;
    const lastFn = stack.findLastIndex((entry) => entry.fn);
    const depth = stack.slice(lastFn + 1).length + 1;
    stack.push({ indent, fn: false });
    if (depth > MAX_DEPTH && added.has(number)) findings.push({ line: number, rule: 'max-depth', text: `nests ${depth} deep, at most ${MAX_DEPTH}`, fail: true });
  });
  return findings;
}

function lineSpacing(line) {
  const found = [];
  if (UNEVEN_EQUALS.test(line)) found.push({ rule: 'space-infix-ops', text: 'needs one space on each side of =' });
  if (BARE_COMMA.test(line)) found.push({ rule: 'comma-spacing', text: 'needs a space after the comma' });
  return found;
}

function maskedCode(file) {
  const code = codeOnlyLines(file.path, file.text).join('\n');
  return code.replace(LITERAL, (literal) => literal.replace(/[^\n]/g, 'x'));
}

function closingBrace(code, from) {
  let level = 1;
  for (let index = from; index < code.length; index++) {
    if (code[index] === '{') level++;
    if (code[index] === '}') level--;
    if (level === 0) return index;
  }
  return -1;
}

function statements(body) {
  const parts = [''];
  let level = 0;
  for (const ch of body) {
    if ('([{'.includes(ch)) level++;
    else if (')]}'.includes(ch)) level--;
    if (level === 0 && (ch === ';' || ch === '\n')) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function swallowsError(body) {
  return statements(body).every((statement) => LOG_STATEMENT.test(statement));
}

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length;
}

function swallowedCatches(code) {
  const found = [];
  for (const match of code.matchAll(CATCH_BLOCK)) {
    const open = match.index + match[0].length;
    const close = closingBrace(code, open);
    if (close < 0 || !swallowsError(code.slice(open, close))) continue;
    found.push({ first: lineOf(code, match.index), last: lineOf(code, close) });
  }
  return found;
}

function catchFindings(file) {
  if (!ESLINT_EXTENSIONS.has(extname(file.path).toLowerCase())) return [];
  return swallowedCatches(maskedCode(file))
    .filter(({ first, last }) => [...file.changed].some((line) => line >= first && line <= last))
    .map(({ first }) => ({ line: first, rule: 'swallowed-catch', text: 'catch block swallows the error: rethrow it or handle it', fail: true }));
}

function spacingFindings(file) {
  if (!ESLINT_EXTENSIONS.has(extname(file.path).toLowerCase())) return [];
  const masked = maskedCode(file).split('\n');
  return masked.flatMap((line, index) => {
    if (!file.changed.has(index + 1)) return [];
    return lineSpacing(line).map((found) => ({ line: index + 1, ...found, fail: true }));
  });
}

function hasProjectConfig(root) {
  return readdirSync(root).some((name) => PROJECT_CONFIG.test(name));
}

function eslintFlags(root, eslint) {
  if (hasProjectConfig(root)) return [];
  const version = execFileSync(eslint, ['--version'], { cwd: root, encoding: 'utf8' });
  return Number(/(\d+)\./.exec(version)?.[1]) >= 9 ? ['--no-config-lookup'] : ['--no-eslintrc'];
}

function runEslint(root, eslint, files) {
  const args = [...eslintFlags(root, eslint), '--format', 'json', ...ESLINT_RULES.flatMap((rule) => ['--rule', rule]), '--', ...files];
  let output;
  try {
    output = execFileSync(eslint, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    output = error.stdout;
  }
  const results = JSON.parse(output);
  if (!Array.isArray(results)) throw new Error('eslint printed no result list');
  return results;
}

function eslintFindings(result, added) {
  return result.messages
    .filter((message) => FAIL_RULES.has(message.ruleId) || WARN_RULES.has(message.ruleId))
    .filter((message) => added.has(message.line))
    .map((message) => ({ line: message.line, rule: message.ruleId, text: message.message, fail: FAIL_RULES.has(message.ruleId) }));
}

function structureByEslint(root, files) {
  const eslint = join(root, 'node_modules', '.bin', 'eslint');
  if (!existsSync(eslint)) return new Map();
  const eligible = files.filter((file) => ESLINT_EXTENSIONS.has(extname(file.path).toLowerCase()));
  if (!eligible.length) return new Map();
  let results;
  try {
    results = runEslint(root, eslint, eligible.map((file) => file.path));
  } catch {
    return new Map();
  }
  const byPath = new Map();
  for (const result of results) {
    if (result.messages.some((message) => message.fatal)) continue;
    const file = eligible.find((entry) => resolve(root, entry.path) === result.filePath || entry.path === relative(root, result.filePath));
    if (file) byPath.set(file.path, eslintFindings(result, file.changed));
  }
  return byPath;
}

function format(path, entry) {
  return `${path}:${entry.line} ${entry.rule} ${entry.text}`;
}

function commentEntries(file) {
  return commentFindings(file.path, [...file.added], file.text).map((found) => ({
    line: found.line,
    rule: found.kind,
    text: found.text,
    fail: true,
  }));
}

function codeOnlyLines(path, text) {
  let result = '';
  let position = 0;
  for (const span of commentSpans(path, text)) {
    result += text.slice(position, span.from) + text.slice(span.from, span.to).replace(/[^\n]/g, '');
    position = span.to;
  }
  result += text.slice(position);
  return result.split('\n').map((line) => line.trim());
}

function baseText(root, base, path) {
  try {
    return git(root, ['show', `${base}:${path}`]);
  } catch {
    return '';
  }
}

function codeChangedLines(root, base, file) {
  const known = new Set(codeOnlyLines(file.path, baseText(root, base, file.path)));
  const current = codeOnlyLines(file.path, file.text);
  return new Set([...file.added].filter((line) => !known.has(current[line - 1])));
}

function readFile(root, base, path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return null;
  const text = readFileSync(absolute, 'utf8');
  const file = { path, text, added: addedLines(root, base, path, text) };
  return { ...file, changed: codeChangedLines(root, base, file) };
}

export function codeRuleFindings({ root, base, paths }) {
  const files = paths
    .filter((path) => CODE_EXTENSIONS[extname(path).toLowerCase()])
    .map((path) => readFile(root, base, path))
    .filter(Boolean);
  const linted = structureByEslint(root, files);
  const fails = [];
  const warns = [];
  for (const file of files) {
    const structure = linted.get(file.path) ?? structureFindings(file.text, file.changed);
    for (const entry of [...commentEntries(file), ...structure, ...catchFindings(file), ...spacingFindings(file)].sort((a, b) => a.line - b.line)) {
      (entry.fail ? fails : warns).push(format(file.path, entry));
    }
  }
  return { fails, warns };
}
