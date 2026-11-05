import fs from 'node:fs';
import path from 'node:path';
import { agentContextTarget, dispatchBytesPerToken, fetchTokens } from './context-limits.mjs';

const SKIPPED = new Set(['.git', 'node_modules']);
const RESULT_FILE = /^\.exo\/[^\s`]+\.md$/;

function lineValue(prompt, name) {
  return new RegExp(`^(?:- )?${name}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(prompt)?.[1];
}

function unquoted(entry) {
  return entry.trim().replace(/^`|`$/g, '');
}

const LINE_RANGE = /(?:#L|:L?)(\d+)(?:-L?(\d+))?$/;

function entryOf(raw) {
  const text = unquoted(raw);
  const match = LINE_RANGE.exec(text);
  if (!match) return { path: text };
  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  return { path: text.slice(0, match.index), first, last };
}

function pathsOf(value) {
  if (value === 'none') return [];
  return value
    .split(/[,\s]+/)
    .map(entryOf)
    .filter((entry) => entry.path);
}

export function briefReads(prompt) {
  return pathsOf(lineValue(prompt, 'Reads') ?? 'none').map((entry) => entry.path);
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
  if (result === undefined || !RESULT_FILE.test(unquoted(result))) missing.push('Result');
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
  const entries = readEntries(pathsOf(reads ?? 'none'), cwd, agentContextTarget() * bytesPerToken);
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
