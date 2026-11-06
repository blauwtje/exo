#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';

const USAGE = [
  'usage: node find-duplicates.mjs --titles <json array of draft titles>',
  'Searches open and recently closed issues for each draft title and prints one JSON line: [{title, matches: [{number, title, state, url, reason}]}].',
  'Read-only: it runs only gh issue list.'
].join('\n');

const SEARCH_LIMIT = 30;
const TOP_MATCHES = 3;
const MIN_SHARED_WORDS = 2;
const MIN_SHARED_RATIO = 0.5;
const CLOSED_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WORD_LENGTH = 3;

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function wordsOf(title) {
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= MIN_WORD_LENGTH));
}

function isRecent(issue, now) {
  if (issue.state === 'OPEN') return true;
  return now - Date.parse(issue.closedAt) <= CLOSED_WINDOW_DAYS * DAY_MS;
}

function scoreIssue(draftWords, issue) {
  const shared = [...wordsOf(issue.title)].filter((word) => draftWords.has(word));
  return { issue, shared, ratio: shared.length / Math.max(draftWords.size, 1) };
}

function isCloseEnough({ shared, ratio }) {
  return shared.length >= MIN_SHARED_WORDS && ratio >= MIN_SHARED_RATIO;
}

function describe({ issue, shared }) {
  const state = issue.state === 'OPEN' ? 'open' : 'closed';
  return {
    number: issue.number,
    title: issue.title,
    state,
    url: issue.url,
    reason: `${state} issue shares ${shared.length} title words: ${shared.join(', ')}`
  };
}

export function matchesFor(title, issues, now) {
  const draftWords = wordsOf(title);
  return issues
    .filter((issue) => isRecent(issue, now))
    .map((issue) => scoreIssue(draftWords, issue))
    .filter(isCloseEnough)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, TOP_MATCHES)
    .map(describe);
}

function searchArgs(title) {
  return ['issue', 'list', '--state', 'all', '--search', `${title} in:title`, '--limit', String(SEARCH_LIMIT), '--json', 'number,title,state,url,closedAt'];
}

export function findDuplicates(titles, { run = runGh, now = Date.now() } = {}) {
  return titles.map((title) => ({ title, matches: matchesFor(title, JSON.parse(run(searchArgs(title))), now) }));
}

function readTitles(raw) {
  if (raw === undefined) throw new UsageError("flag '--titles' takes a JSON array of draft titles");
  const titles = JSON.parse(raw);
  if (!Array.isArray(titles) || titles.some((title) => typeof title !== 'string')) throw new UsageError("flag '--titles' takes a JSON array of strings");
  return titles;
}

function main(argv) {
  const flags = parseFlags(argv, { titles: 'value' }, { usage: USAGE });
  console.log(JSON.stringify(findDuplicates(readTitles(flags.titles))));
}

function run(argv) {
  try {
    main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) {
      console.log(`duplicates: error ${error.message}`);
      process.exitCode = 3;
      return;
    }
    process.stderr.write(`find-duplicates: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) run(process.argv.slice(2));
