import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { agentContextTarget, dispatchBytesPerToken, fetchTokens } from './context-limits.mjs';

const SEARCH_NOTE = '(grep -n first, then read by range)';
const SKIPPED = new Set(['.git', 'node_modules']);
export const RESULT_FILE = /(?:^|\/)\.exo\/[^\s`]+\.md$/;
const READS_LINE = /^((?:- )?Reads:[ \t]*)(.+?)[ \t]*$/m;
const WRAPPING = /^[`'"([{]+|[`'")\]}.,;:!?]+$/g;
const PATH_LIKE = /[/*?]|\.[A-Za-z0-9]{1,8}$/;
const GLOB = /[*?]/;
const PARENTHESIZED = /(^|\s)\([^)]*\)(?=[\s,;.]|$)/g;

function lineValue(prompt, name) {
  return new RegExp(`^(?:- )?${name}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(prompt)?.[1];
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

function itemOf(raw, base) {
  const text = raw.replace(WRAPPING, '');
  if (!text || text.toLowerCase() === 'none') return { kind: 'none' };
  const entry = entryOf(text);
  if (!PATH_LIKE.test(entry.path) && !fs.existsSync(path.resolve(base, entry.path))) return { kind: 'prose' };
  return { kind: 'path', text, entry };
}

function itemsOf(value, base) {
  return value.replace(PARENTHESIZED, '$1').split(/[,\s]+/).filter(Boolean).map((raw) => itemOf(raw, base));
}

function expandedEntries(items, base) {
  return items.filter((item) => item.kind === 'path').flatMap(({ entry }) => {
    if (!GLOB.test(entry.path)) return [entry];
    const matches = globbed(entry.path, base);
    return matches.length ? matches.map((match) => ({ path: match })) : [entry];
  });
}

function baseOf(prompt, cwd) {
  return wordsOf(lineValue(prompt, 'Worktree')).find((word) => path.isAbsolute(word) && fs.existsSync(word)) ?? cwd;
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

function locatedItem(item, files) {
  const name = item.entry.path;
  const matches = files.filter((file) => file === name || file.endsWith(`/${name}`));
  if (matches.length !== 1) return { item, matches };
  const entry = { ...item.entry, path: matches[0] };
  return { item: { ...item, text: matches[0] + item.text.slice(name.length), entry }, matches };
}

function located(items, base) {
  const pending = items.filter((item) => isUnresolved(item, base));
  if (!pending.length) return { items, ambiguous: [] };
  const files = trackedFiles(base);
  const found = new Map(pending.map((item) => [item, locatedItem(item, files)]));
  const ambiguous = [...found.values()].filter(({ matches }) => matches.length > 1).map(({ item, matches }) => ({ name: item.entry.path, matches }));
  return { items: items.map((item) => found.get(item)?.item ?? item), ambiguous };
}

export function locatedReads(prompt, cwd = process.cwd()) {
  const match = READS_LINE.exec(prompt ?? '');
  if (!match) return { prompt, ambiguous: [] };
  const base = baseOf(prompt, cwd);
  const { items, ambiguous } = located(itemsOf(match[2], base), base);
  if (items.some((item) => item.kind === 'prose')) return { prompt, ambiguous };
  const value = items.filter((item) => item.kind === 'path').map((item) => item.text).join(', ') || 'none';
  return { prompt: value === match[2] ? prompt : prompt.replace(READS_LINE, (_, head) => head + value), ambiguous };
}

export function normalizedReads(prompt, cwd) {
  return locatedReads(prompt, cwd).prompt;
}

export function briefReads(prompt, cwd = process.cwd()) {
  const base = baseOf(prompt, cwd);
  return expandedEntries(itemsOf(lineValue(prompt, 'Reads') ?? 'none', base), base).map((entry) => entry.path);
}

function rangeBytes(target, { first, last }) {
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  return Buffer.byteLength(lines.slice(first - 1, last).join('\n'));
}

function bytesOf(target, limit) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let sum = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (sum > limit) break;
    if (SKIPPED.has(entry.name) || entry.isSymbolicLink()) continue;
    sum += bytesOf(path.join(target, entry.name), limit - sum);
  }
  return sum;
}

function readEntries(paths, cwd, limit) {
  return paths.map((entry) => {
    const target = path.resolve(cwd, entry.path);
    const resolved = fs.existsSync(target);
    const ranged = resolved && entry.first !== undefined && fs.statSync(target).isFile();
    const bytes = ranged ? rangeBytes(target, entry) : bytesOf(target, limit);
    return { path: entry.path, resolved, bytes: resolved ? bytes : 0 };
  });
}

export function workersOf(prompt) {
  const value = lineValue(prompt, 'Workers');
  if (!/^[1-9]\d*$/.test(value ?? '')) return undefined;
  return Number(value);
}

function missingFields(reads, result) {
  const missing = [];
  if (reads === undefined) missing.push('Reads');
  if (!wordsOf(result).some((word) => RESULT_FILE.test(word))) missing.push('Result');
  return missing;
}

function largestReads(entries, bytesPerToken) {
  return entries
    .map((entry) => ({ path: entry.path, tokens: Math.round(entry.bytes / bytesPerToken) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 3);
}

function isSingleFile(entries, base) {
  return entries.length === 1 && fs.statSync(path.resolve(base, entries[0].path), { throwIfNoEntry: false })?.isFile() === true;
}

function unitOf(item, base, bytesPerToken, budget) {
  const entries = expandedEntries([item], base);
  const bytes = readEntries(entries, base, agentContextTarget() * bytesPerToken).reduce((sum, entry) => sum + entry.bytes, 0);
  const tokens = bytes / bytesPerToken;
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

function searchedBrief(prompt, match, units, moved) {
  const textOf = (list) => list.map((unit) => unit.item.text);
  const kept = units.filter((unit) => !moved.includes(unit));
  const search = textOf(units.filter((unit) => moved.includes(unit))).join(', ');
  const prefix = match[1].startsWith('- ') ? '- ' : '';
  return prompt.replace(READS_LINE, (_, head) => `${head}${textOf(kept).join(', ') || 'none'}\n${prefix}Search: ${search} ${SEARCH_NOTE}`);
}

export function budgetedReads(prompt, cwd = process.cwd()) {
  const match = READS_LINE.exec(prompt ?? '');
  if (!match) return prompt;
  const size = workerSize({ prompt, cwd });
  if (size.tokens <= size.budget || size.unresolved.length || size.invalid.length) return prompt;
  const base = baseOf(prompt, cwd);
  const items = itemsOf(match[2], base);
  if (items.some((item) => item.kind === 'prose')) return prompt;
  const bytesPerToken = dispatchBytesPerToken();
  const units = items.filter((item) => item.kind === 'path').map((item) => unitOf(item, base, bytesPerToken, size.budget));
  const moved = movedUnits(units, size.tokens - size.budget);
  return moved.length ? searchedBrief(prompt, match, units, moved) : prompt;
}

export function workerSize({ prompt = '', cwd = process.cwd() }) {
  const reads = lineValue(prompt, 'Reads');
  const result = lineValue(prompt, 'Result');
  const fetchValue = lineValue(prompt, 'Fetches');
  const validFetch = fetchValue === undefined || /^\d+$/.test(fetchValue);
  const fetches = validFetch ? Number(fetchValue ?? 0) : 0;
  const bytesPerToken = dispatchBytesPerToken();
  const base = baseOf(prompt, cwd);
  const entries = readEntries(expandedEntries(itemsOf(reads ?? 'none', base), base), base, agentContextTarget() * bytesPerToken);
  const missing = missingFields(reads, result);
  const largest = largestReads(entries, bytesPerToken);
  return {
    tokens: Math.round(entries.reduce((sum, entry) => sum + entry.bytes, 0) / bytesPerToken) + fetches * fetchTokens(),
    budget: Math.round(agentContextTarget() / 2),
    missing,
    workers: workersOf(prompt),
    unresolved: entries.filter((entry) => !entry.resolved).map((entry) => entry.path),
    invalid: validFetch ? [] : ['Fetches'],
    largest,
    sized: reads !== undefined || fetchValue !== undefined,
  };
}
