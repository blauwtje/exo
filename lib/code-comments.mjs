import { extname } from 'node:path';

const C_STYLE = { line: ['//'], block: ['/*', '*/'], doc: /^\/\*\*|^\/\/\//, exported: null };
const JS_STYLE = { ...C_STYLE, backtick: true, regex: true, exported: /^(?:export|module\.exports)\b/ };
const JVM_STYLE = { ...C_STYLE, chars: true, triple: ['"""'], exported: /^public\b/ };
const HASH_STYLE = { line: ['#'], spaced: true };
const SQL_STYLE = { line: ['--'], block: ['/*', '*/'] };
const GO_STYLE = {
  ...C_STYLE,
  backtick: true,
  chars: true,
  doc: /^\/\//,
  exported: /^(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)[A-Z]/,
};
const RUST_STYLE = { ...C_STYLE, chars: true, doc: /^\/\/[/!]/, exported: /^pub\b/ };
const PYTHON_STYLE = { line: ['#'], triple: ['"""', "'''"] };
const RUBY_STYLE = { ...HASH_STYLE, doc: /^#/, exported: /^(?:def|class|module)\b/ };
const POWERSHELL_STYLE = { ...HASH_STYLE, block: ['<#', '#>'], doc: /^<#/, exported: /^function\b/i };
const LUA_STYLE = { line: ['--'], block: ['--[[', ']]'], doc: /^---/, exported: /^function\b/ };
const PHP_STYLE = {
  ...C_STYLE,
  line: ['//', '#'],
  lineExclude: /^#\[/,
  doc: /^\/\*\*/,
  exported: /^(?:public|class|interface|trait|function)\b/,
};
const SWIFT_STYLE = { ...JVM_STYLE, exported: /^(?:public|open)\b/ };
const CSHARP_STYLE = { ...JVM_STYLE, triple: null };

/** The comment syntax of each code extension; prose and config extensions are absent. */
export const CODE_EXTENSIONS = {
  '.js': JS_STYLE,
  '.mjs': JS_STYLE,
  '.cjs': JS_STYLE,
  '.jsx': JS_STYLE,
  '.ts': JS_STYLE,
  '.tsx': JS_STYLE,
  '.mts': JS_STYLE,
  '.cts': JS_STYLE,
  '.py': PYTHON_STYLE,
  '.rb': RUBY_STYLE,
  '.go': GO_STYLE,
  '.rs': RUST_STYLE,
  '.java': JVM_STYLE,
  '.kt': JVM_STYLE,
  '.kts': JVM_STYLE,
  '.cs': CSHARP_STYLE,
  '.c': { ...C_STYLE, chars: true },
  '.h': { ...C_STYLE, chars: true },
  '.cc': { ...C_STYLE, chars: true },
  '.cpp': { ...C_STYLE, chars: true },
  '.hpp': { ...C_STYLE, chars: true },
  '.swift': SWIFT_STYLE,
  '.php': PHP_STYLE,
  '.sh': HASH_STYLE,
  '.bash': HASH_STYLE,
  '.zsh': HASH_STYLE,
  '.ps1': POWERSHELL_STYLE,
  '.lua': LUA_STYLE,
  '.sql': SQL_STYLE,
};

const CHAR_LITERAL = /'(?:\\[^']+|[^\\'])'/y;
const REGEX_PREFIX = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof))\s*$/;
const DIRECTIVE = /^(?:\/\/go:|\/\/\/\s*<reference|\/\/\s*@ts-check|\/\/\s*\+build)/;
const CODING_LINE = /^#.*coding[:=]\s*[-\w.]+/;
const COMMENT_SILENCER = /prettier-ignore|eslint-disable(?:-next-line|-line)?|@ts-(?:ignore|nocheck|expect-error)|#\s*(?:noqa|type:\s*ignore|pylint:\s*disable)|\/\/\s*nolint|biome-ignore|(?:istanbul|c8) ignore|rubocop:disable/;
const CODE_SILENCER = /^\s*(?:#pragma warning disable|@SuppressWarnings|#!?\[allow\()/;
const STYLE_RULE = /^(?:prettier-ignore|max-len|E501|@stylistic\/\S+)$/;
const RULE_NAME = /[A-Za-z@][\w@/.-]*/g;
const REFERENCE = /https?:\/\/\S*\/(?:issues|pull|pulls|merge_requests)\/\d+|https?:\/\/\S*rfc\d+|\bRFC\s?\d+|\bwhy:/;
const LICENSE = /licen[sc]e|copyright|SPDX/i;
const ANNOTATION = /^\s*(?:@\w|#\[)/;

function advance(state, count) {
  const stop = Math.min(state.pos + count, state.text.length);
  for (; state.pos < stop; state.pos++) {
    if (state.text[state.pos] === '\n') state.line++;
  }
}

function takeComment(state, stop, block) {
  const { text, pos, line } = state;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const standalone = text.slice(lineStart, pos).trim() === '';
  const raw = text.slice(pos, stop);
  advance(state, stop - pos);
  state.spans.push({ start: line, end: state.line, from: pos, to: stop, raw, standalone, block });
}

function scanBlock(state, [open, close]) {
  const end = state.text.indexOf(close, state.pos + open.length);
  takeComment(state, end < 0 ? state.text.length : end + close.length, true);
}

function scanLine(state) {
  const end = state.text.indexOf('\n', state.pos);
  takeComment(state, end < 0 ? state.text.length : end, false);
}

function scanString(state, delim, multiline) {
  advance(state, delim.length);
  while (state.pos < state.text.length) {
    if (state.text.startsWith(delim, state.pos)) return advance(state, delim.length);
    const ch = state.text[state.pos];
    if (ch === '\n' && !multiline) return;
    advance(state, ch === '\\' ? 2 : 1);
  }
}

function scanChar(state) {
  CHAR_LITERAL.lastIndex = state.pos;
  const match = CHAR_LITERAL.exec(state.text);
  advance(state, match ? match[0].length : 1);
}

function scanRegex(state) {
  let inClass = false;
  advance(state, 1);
  while (state.pos < state.text.length) {
    const ch = state.text[state.pos];
    if (ch === '\n') return;
    advance(state, ch === '\\' ? 2 : 1);
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return;
  }
}

function regexAllowed(state) {
  return REGEX_PREFIX.test(state.text.slice(Math.max(0, state.pos - 12), state.pos));
}

function startsLineComment(state, syntax) {
  const { text, pos } = state;
  if (syntax.lineExclude?.test(text.slice(pos, pos + 2))) return false;
  if (!syntax.line.some((token) => text.startsWith(token, pos))) return false;
  return !syntax.spaced || pos === 0 || /[\s;]/.test(text[pos - 1]);
}

function scanOther(state, syntax) {
  const ch = state.text[state.pos];
  if (ch === '"') return scanString(state, ch, false);
  if (ch === "'") return syntax.chars ? scanChar(state) : scanString(state, ch, false);
  if (ch === '`' && syntax.backtick) return scanString(state, ch, true);
  if (ch === '/' && syntax.regex && regexAllowed(state)) return scanRegex(state);
  return advance(state, 1);
}

function step(state, syntax) {
  const { text, pos } = state;
  if (syntax.block && text.startsWith(syntax.block[0], pos)) return scanBlock(state, syntax.block);
  if (startsLineComment(state, syntax)) return scanLine(state);
  const triple = syntax.triple?.find((delim) => text.startsWith(delim, pos));
  if (triple) return scanString(state, triple, true);
  return scanOther(state, syntax);
}

function scanComments(text, syntax) {
  const state = { text, pos: 0, line: 1, spans: [] };
  while (state.pos < text.length) step(state, syntax);
  return state.spans;
}

function firstCodeLine(text, spans) {
  let code = '';
  let pos = 0;
  for (const span of spans) {
    code += text.slice(pos, span.from) + span.raw.replace(/[^\n]/g, ' ');
    pos = span.to;
  }
  code += text.slice(pos);
  const index = code.search(/\S/);
  return index < 0 ? Infinity : code.slice(0, index).split('\n').length;
}

function isDirective(span) {
  const raw = span.raw.trim();
  if (raw.startsWith('#!')) return span.start === 1;
  return DIRECTIVE.test(raw) || (span.start <= 2 && CODING_LINE.test(raw));
}

function isStyleOnly(text) {
  const match = COMMENT_SILENCER.exec(text) ?? CODE_SILENCER.exec(text);
  if (match[0] === 'prettier-ignore') return true;
  const named = text.slice(match.index + match[0].length).split(/\s--\s/)[0];
  const rules = named.match(RULE_NAME) ?? [];
  return rules.length > 0 && rules.every((rule) => STYLE_RULE.test(rule));
}

function addedIn(span, ctx) {
  for (let line = span.start; line <= span.end; line++) {
    if (ctx.added.has(line)) return line;
  }
  return null;
}

function finding(line, kind, ctx) {
  return { line, kind, text: ctx.lines[line - 1].trim() };
}

function spanSuppression(span, ctx) {
  const line = addedIn(span, ctx);
  if (line === null || isStyleOnly(span.raw)) return [];
  return [finding(line, 'suppression', ctx)];
}

function codeSuppressions(spans, ctx) {
  const covered = (line) => spans.some((span) => span.start <= line && line <= span.end);
  return [...ctx.added]
    .filter((line) => CODE_SILENCER.test(ctx.lines[line - 1] ?? '') && !covered(line))
    .filter((line) => !isStyleOnly(ctx.lines[line - 1]))
    .map((line) => finding(line, 'suppression', ctx));
}

function joinsGroup(last, span) {
  return Boolean(last) && last.standalone && span.standalone && !last.block && !span.block && last.end === span.start - 1;
}

function groupSpans(spans) {
  const groups = [];
  for (const span of spans) {
    const last = groups.at(-1);
    if (joinsGroup(last, span)) {
      last.end = span.end;
      last.raw += `\n${span.raw}`;
      last.spans.push(span);
    } else {
      groups.push({ ...span, spans: [span] });
    }
  }
  return groups;
}

function isDocComment(group, ctx) {
  const { doc, exported } = ctx.syntax;
  if (!doc || !exported || !group.standalone || !doc.test(group.raw.trim())) return false;
  let index = group.end;
  while (ANNOTATION.test(ctx.lines[index] ?? '')) index++;
  return exported.test((ctx.lines[index] ?? '').trim());
}

function isAllowed(group, ctx) {
  if (REFERENCE.test(group.raw)) return true;
  if (group.end < ctx.firstCode && LICENSE.test(group.raw)) return true;
  return isDocComment(group, ctx);
}

function groupFindings(group, ctx) {
  if (isAllowed(group, ctx)) return [];
  return group.spans
    .map((span) => addedIn(span, ctx))
    .filter((line) => line !== null)
    .map((line) => finding(line, 'comment', ctx));
}

/**
 * The comments and suppressions on the added lines of a file, as `{ line, kind, text }`
 * with `kind` of `comment` or `suppression`. `addedLines` holds 1-based line numbers (or
 * `{ line }` objects) of `fileText`; a file outside CODE_EXTENSIONS has none.
 */
export function commentFindings(file, addedLines, fileText) {
  const syntax = CODE_EXTENSIONS[extname(file).toLowerCase()];
  if (!syntax) return [];
  const spans = scanComments(fileText, syntax);
  const ctx = {
    syntax,
    lines: fileText.split('\n'),
    added: new Set(addedLines.map((entry) => entry.line ?? entry)),
    firstCode: firstCodeLine(fileText, spans),
  };
  const candidates = spans.filter((span) => !isDirective(span));
  const silencers = candidates.filter((span) => COMMENT_SILENCER.test(span.raw));
  const plain = candidates.filter((span) => !COMMENT_SILENCER.test(span.raw));
  return [
    ...silencers.flatMap((span) => spanSuppression(span, ctx)),
    ...groupSpans(plain).flatMap((group) => groupFindings(group, ctx)),
    ...codeSuppressions(spans, ctx),
  ].sort((a, b) => a.line - b.line);
}
