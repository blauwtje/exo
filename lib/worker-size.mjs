import fs from 'node:fs';
import path from 'node:path';
import { agentContextTarget, dispatchBytesPerToken, fetchTokens } from './context-limits.mjs';

const SKIPPED = new Set(['.git', 'node_modules']);
const RESULT_FILE = /(?:^|\/)\.exo\/[^\s`]+\.md$/;
const READS_LINE = /^((?:- )?Reads:[ \t]*)(.+?)[ \t]*$/m;
const WRAPPING = /^[`'"([{]+|[`'")\]}.,;:!?]+$/g;
const PATH_LIKE = /[/*?]|\.[A-Za-z0-9]{1,8}$/;
const GLOB = /[*?]/;

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
  return value.split(/[,\s]+/).filter(Boolean).map((raw) => itemOf(raw, base));
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

export function normalizedReads(prompt, cwd = process.cwd()) {
  const match = READS_LINE.exec(prompt ?? '');
  if (!match) return prompt;
  const items = itemsOf(match[2], baseOf(prompt, cwd));
  if (items.some((item) => item.kind === 'prose')) return prompt;
  const value = items.filter((item) => item.kind === 'path').map((item) => item.text).join(', ') || 'none';
  return value === match[2] ? prompt : prompt.replace(READS_LINE, `$1${value}`);
}

export function withNormalReads(input, cwd) {
  const prompt = normalizedReads(input.prompt, cwd);
  return prompt === input.prompt ? input : { ...input, prompt };
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

function workersOf(prompt) {
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
