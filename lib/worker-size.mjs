import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { agentContextTarget, dispatchBytesPerToken, fetchTokens } from './context-limits.mjs';
import { resolveRead, searchedDirectories } from './read-estimate.mjs';
import { readEntries } from './read-entries.mjs';

const SEARCH_NOTE = '(grep -n first, then read by range)';
const SKIPPED = new Set(['.git', 'node_modules']);
import { RESULT_FILE } from './result-file.mjs';
const RESULT_REPLY = /^[`'"([{]*reply(?:[ \t]+text)?\b/i;
const LABELS = 'Reads|Result|Fetches|Sources|Workers|Worktree';
const LINE_LEAD = /^[ \t]*(?:(?:[-*]|\d+\.)[ \t]+)?/;
const LABEL_START = String.raw`(?:\*\*)?(?:${LABELS})(?::\*\*|\*\*:|:)`;
const LABEL_HEAD = new RegExp(String.raw`^(?:\*\*)?(${LABELS})(?::\*\*|\*\*:|:)[ \t]*`);
const FIELD_BREAK = new RegExp(String.raw`[.;,]?[ \t]+(?=${LABEL_START})`, 'y');
const NUMBER_TAIL = String.raw`(?![\w.]*\w)`;
const LEADING_NUMBER = new RegExp(String.raw`^(\d+)${NUMBER_TAIL}`);
const LEADING_COUNT = new RegExp(String.raw`^([1-9]\d*)${NUMBER_TAIL}`);
const WRAPPING = /^[`'"([{]+|[`'")\]}.,;:!?]+$/g;
const PATH_LIKE = /[/*?]|\.[A-Za-z0-9]{1,8}$/;
const GLOB = /[*?]/;

function fieldBreaks(body) {
  const breaks = [];
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '`') quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth = Math.max(0, depth - 1);
    if (quoted || depth > 0) continue;
    FIELD_BREAK.lastIndex = index;
    const cut = FIELD_BREAK.exec(body);
    if (!cut) continue;
    breaks.push({ index, length: cut[0].length });
    index += cut[0].length - 1;
  }
  return breaks;
}

function lineFields(line, lineStart) {
  const lead = LINE_LEAD.exec(line)[0];
  const body = line.slice(lead.length);
  if (!LABEL_HEAD.test(body)) return [];
  const cuts = fieldBreaks(body);
  const spans = [0, ...cuts.map((cut) => cut.index + cut.length)].map((from, index) => ({ from, to: cuts[index]?.index ?? body.length }));
  return spans.flatMap(({ from, to }) => {
    const head = LABEL_HEAD.exec(body.slice(from, to));
    const value = body.slice(from + head[0].length, to).trimEnd();
    if (!value) return [];
    const start = lineStart + lead.length + from + head[0].length;
    return [{ name: head[1], value, start, end: start + value.length, lead, lineEnd: lineStart + line.length }];
  });
}

function fieldOf(prompt, name) {
  for (const line of prompt.matchAll(/^.*$/gm)) {
    const found = lineFields(line[0], line.index).find((field) => field.name === name);
    if (found) return found;
  }
  return undefined;
}

function lineValue(prompt, name) {
  return fieldOf(prompt, name)?.value;
}

function replacedField(prompt, field, value) {
  return `${prompt.slice(0, field.start)}${value}${prompt.slice(field.end)}`;
}

function wordsOf(value = '') {
  return value.split(/[,\s]+/).map((raw) => raw.replace(WRAPPING, '')).filter(Boolean);
}

const LINE_RANGE = /(?:#L|:L?)(\d+)(?:-L?(\d+))?$/;

function entryOf(text) {
  const match = LINE_RANGE.exec(text);
  if (!match) return { path: text };
  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  return { path: text.slice(0, match.index), first, last };
}

function globPattern(part) {
  const escaped = part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '[^/]*').replaceAll('?', '[^/]');
  return new RegExp(`^${escaped}$`);
}

function childrenMatching(directory, part, base) {
  const pattern = globPattern(part);
  try {
    return fs.readdirSync(path.resolve(base, directory || '.'))
      .filter((name) => pattern.test(name) && !SKIPPED.has(name) && (part.startsWith('.') || !name.startsWith('.')))
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

function globbed(pattern, base) {
  let found = [pattern.startsWith('/') ? '/' : ''];
  for (const part of pattern.split('/').filter(Boolean)) {
    found = GLOB.test(part) ? found.flatMap((directory) => childrenMatching(directory, part, base)) : found.map((directory) => path.join(directory, part));
  }
  return found;
}

const RANGE_WORDS = /\blines?\s+(\d+)(?:\s*(?:-|–|to|\.\.)\s*(\d+))?/i;
const SEARCH_WORDS = /\bgrep\b|\bby range\b|\bsearch\b/i;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

function segmentsOf(value) {
  const segments = [''];
  const separators = [];
  let depth = 0;
  let quoted = false;
  for (const char of value) {
    if (char === '`') quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth = Math.max(0, depth - 1);
    if (!quoted && depth === 0 && (char === ',' || char === ';')) {
      separators.push(char);
      segments.push('');
    } else segments[segments.length - 1] += char;
  }
  return { segments, separators };
}

function isPathWord(word, base) {
  const entry = entryOf(word);
  return Boolean(word) && (PATH_LIKE.test(entry.path) || fs.existsSync(path.resolve(base, entry.path)));
}

function pathItem(text, word, seg) {
  const entry = entryOf(word);
  return { kind: 'path', text, entry, origin: entry.path, seg };
}

function qualified(item, rest) {
  const range = RANGE_WORDS.exec(rest);
  const entry = { ...item.entry };
  if (range && entry.first === undefined) Object.assign(entry, { first: Number(range[1]), last: Number(range[2] ?? range[1]) });
  if (SEARCH_WORDS.test(rest)) entry.searched = true;
  return { ...item, entry };
}

function segmentItems(segment, seg, base) {
  const text = segment.trim();
  const words = text.split(/\s+/).map((raw) => raw.replace(WRAPPING, '')).filter(Boolean);
  if (!words.length || (words.length === 1 && words[0].toLowerCase() === 'none')) return [{ kind: 'none', seg }];
  if (words.every((word) => isPathWord(word, base))) return words.map((word) => pathItem(word, word, seg));
  const [first] = words;
  const rest = text.slice(text.indexOf(first) + first.length);
  const free = rest.replace(/\([^)]*\)/g, '').replace(/[`'".,;:!?\s]+/g, '') !== '';
  const entry = entryOf(first);
  const named = PATH_LIKE.test(entry.path) && (!free || HAS_EXTENSION.test(entry.path) || fs.existsSync(path.resolve(base, entry.path)));
  if (!named) return [{ kind: 'prose', seg }];
  return [{ ...qualified(pathItem(free ? text : first, first, seg), rest), free }];
}

function itemsOf(value, base) {
  return segmentsOf(value).segments.flatMap((segment, seg) => segmentItems(segment, seg, base));
}

function expandedEntries(items, base) {
  return items.filter((item) => item.kind === 'path').flatMap(({ entry }) => {
    if (!GLOB.test(entry.path)) return [entry];
    const matches = globbed(entry.path, base);
    return matches.length ? matches.map((match) => ({ path: match, searched: entry.searched })) : [entry];
  });
}

function isDirectory(target) {
  return fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;
}

export function baseOf(prompt, cwd) {
  const first = wordsOf(lineValue(prompt, 'Worktree')).find((word) => path.isAbsolute(word));
  return first && isDirectory(first) ? first : cwd;
}

function trackedFiles(base) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function isUnresolved(item, base) {
  if (item.kind !== 'path') return false;
  const name = item.entry.path;
  return !path.isAbsolute(name) && !GLOB.test(name) && !fs.existsSync(path.resolve(base, name));
}

function withPath(item, name) {
  const entry = { ...item.entry, path: name };
  return { ...item, text: item.text.replace(item.entry.path, name), entry };
}

function nearbyItem(item, base, session) {
  const found = resolveRead(item.entry.path, { base, session });
  return found ? withPath(item, found) : item;
}

function locatedItem(item, files) {
  const name = item.entry.path;
  const matches = files.filter((file) => file === name || file.endsWith(`/${name}`));
  if (matches.length !== 1) return { item, matches };
  return { item: withPath(item, matches[0]), matches };
}

function located(items, base, session) {
  const nearby = items.map((item) => (isUnresolved(item, base) ? nearbyItem(item, base, session) : item));
  const pending = nearby.filter((item) => isUnresolved(item, base));
  if (!pending.length) return { items: nearby, ambiguous: [] };
  const files = trackedFiles(base);
  const found = new Map(pending.map((item) => [item, locatedItem(item, files)]));
  const ambiguous = [...found.values()].filter(({ matches }) => matches.length > 1).map(({ item, matches }) => ({ name: item.entry.path, matches }));
  return { items: nearby.map((item) => found.get(item)?.item ?? item), ambiguous };
}

export function locatedReads(prompt, cwd = process.cwd(), session) {
  const field = fieldOf(prompt ?? '', 'Reads');
  if (!field) return { prompt, ambiguous: [] };
  const base = baseOf(prompt, cwd);
  const { items, ambiguous } = located(itemsOf(field.value, base), base, session);
  const value = items.some((item) => item.kind === 'prose' || item.free) ? rebuiltReads(field.value, items) : joinedReads(items);
  return { prompt: value === field.value ? prompt : replacedField(prompt, field, value), ambiguous };
}

function joinedReads(items) {
  return items.filter((item) => item.kind === 'path').map((item) => item.text).join(', ') || 'none';
}

function rebuiltReads(value, items) {
  const moved = items.filter((item) => item.kind === 'path' && item.origin !== item.entry.path);
  if (!moved.length) return value;
  const { segments, separators } = segmentsOf(value);
  for (const item of moved) segments[item.seg] = segments[item.seg].replace(item.origin, item.entry.path);
  return segments.map((segment, index) => (index ? `${separators[index - 1]}${segment}` : segment)).join('');
}

export function normalizedReads(prompt, cwd, session) {
  return locatedReads(prompt, cwd, session).prompt;
}

export function briefReads(prompt, cwd = process.cwd(), session) {
  const base = baseOf(prompt, cwd);
  const { items } = located(itemsOf(lineValue(prompt, 'Reads') ?? 'none', base), base, session);
  return expandedEntries(items, base).map((entry) => entry.path);
}

export function workersOf(prompt) {
  const value = LEADING_COUNT.exec(lineValue(prompt, 'Workers') ?? '')?.[1];
  return value === undefined ? undefined : Number(value);
}

function resultKind(result) {
  if (wordsOf(result).some((word) => RESULT_FILE.test(word))) return 'file';
  return RESULT_REPLY.test((result ?? '').trim()) ? 'reply' : 'none';
}

export function briefResultKind(prompt) {
  return resultKind(lineValue(prompt, 'Result'));
}

function missingFields(reads, result) {
  const missing = [];
  if (reads === undefined) missing.push('Reads');
  if (resultKind(result) !== 'file') missing.push('Result');
  return missing;
}

function largestReads(entries) {
  return entries
    .map((entry) => ({ path: entry.path, tokens: Math.round(entry.tokens) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 3);
}

function isSingleFile(entries, base) {
  return entries.length === 1 && fs.statSync(path.resolve(base, entries[0].path), { throwIfNoEntry: false })?.isFile() === true;
}

function unitOf(item, base, bytesPerToken, budget) {
  const entries = expandedEntries([item], base);
  const tokens = readEntries(entries, base, bytesPerToken).reduce((sum, entry) => sum + entry.tokens, 0);
  const ranged = item.entry.first !== undefined;
  const wholeFileOverBudget = tokens > budget && isSingleFile(entries, base);
  return { item, tokens, movable: tokens > 0 && !ranged && !wholeFileOverBudget };
}

function movedUnits(units, excess) {
  const moved = [];
  let rest = units.filter((unit) => unit.movable).sort((a, b) => b.tokens - a.tokens);
  let over = excess;
  while (over > 0 && rest.length) {
    const fitting = rest.filter((unit) => unit.tokens >= over);
    const pick = fitting.length ? fitting.at(-1) : rest[0];
    moved.push(pick);
    over -= pick.tokens;
    rest = rest.filter((unit) => unit !== pick);
  }
  return over > 0 ? [] : moved;
}

function searchedBrief(prompt, field, units, moved) {
  const textOf = (list) => list.map((unit) => unit.item.text);
  const kept = units.filter((unit) => !moved.includes(unit));
  const search = textOf(units.filter((unit) => moved.includes(unit))).join(', ');
  const prefix = field.lead.trimStart() === '- ' ? '- ' : '';
  const keptText = textOf(kept).join(', ') || 'none';
  const reduced = replacedField(prompt, field, keptText);
  const lineEnd = field.lineEnd - field.value.length + keptText.length;
  return `${reduced.slice(0, lineEnd)}\n${prefix}Search: ${search} ${SEARCH_NOTE}${reduced.slice(lineEnd)}`;
}

export function budgetedReads(prompt, cwd = process.cwd(), session) {
  const field = fieldOf(prompt ?? '', 'Reads');
  if (!field) return prompt;
  const size = workerSize({ prompt, cwd, session });
  if (size.tokens <= size.budget || size.unresolved.length || size.invalid.length) return prompt;
  const base = baseOf(prompt, cwd);
  const items = itemsOf(field.value, base);
  if (items.some((item) => item.kind === 'prose')) return prompt;
  const bytesPerToken = dispatchBytesPerToken();
  const units = items.filter((item) => item.kind === 'path').map((item) => unitOf(item, base, bytesPerToken, size.budget));
  const moved = movedUnits(units, size.tokens - size.budget);
  return moved.length ? searchedBrief(prompt, field, units, moved) : prompt;
}

export function webSources(prompt = '') {
  return /\b(?:web|docs)\b/i.test(lineValue(prompt, 'Sources') ?? '');
}

export function workerSize({ prompt = '', cwd = process.cwd(), session, requireFetches = false }) {
  const reads = lineValue(prompt, 'Reads');
  const result = lineValue(prompt, 'Result');
  const fetchValue = lineValue(prompt, 'Fetches');
  const fetchCount = LEADING_NUMBER.exec(fetchValue ?? '')?.[1];
  const validFetch = fetchValue === undefined ? !requireFetches : fetchCount !== undefined;
  const fetches = Number(fetchCount ?? 0);
  const bytesPerToken = dispatchBytesPerToken();
  const base = baseOf(prompt, cwd);
  const { items } = located(itemsOf(reads ?? 'none', base), base, session);
  const entries = readEntries(expandedEntries(items, base), base, bytesPerToken);
  const missing = missingFields(reads, result);
  const largest = largestReads(entries);
  const unresolved = entries.filter((entry) => !entry.resolved).map((entry) => entry.path);
  return {
    tokens: Math.round(entries.reduce((sum, entry) => sum + entry.tokens, 0)) + fetches * fetchTokens(),
    budget: Math.round(agentContextTarget() / 2),
    missing,
    workers: workersOf(prompt),
    unresolved,
    searched: unresolved.length ? searchedDirectories(base, session) : [],
    invalid: validFetch ? [] : ['Fetches'],
    largest,
    sized: reads !== undefined || fetchValue !== undefined,
  };
}
