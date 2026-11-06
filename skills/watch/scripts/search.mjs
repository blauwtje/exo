#!/usr/bin/env node

import process from 'node:process';
import { UsageError, environmentMs, parseFlags, isMain } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { entryLine } from './listing.mjs';
import { runYtDlpWithRuntime, ytDlpReason, ytDlpAvailable, YTDLP_INSTALL } from './ytdlp.mjs';

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const DAY_MS = 86400000;
const YOUTUBE = 'https://www.youtube.com/';

const SPEC = { query: 'string', limit: 'string', newest: 'boolean', help: 'boolean' };
const USAGE = [
  'usage: node search.mjs --query <text> [--limit <n>] [--newest]',
  'Searches YouTube through yt-dlp from metadata alone: nothing is downloaded or written to disk.',
  'Prints one line per video: id, url, title, upload date, duration, views and views per day, each only when known. --newest sorts by upload date instead of relevance.',
  'Defaults: --limit 10. EXO_WATCH_YTDLP_MS sets the wait for yt-dlp (default 120000).',
  'Exit codes: 0 listed; 1 yt-dlp failed, found nothing or is missing (`missing tool`, with its install command); 2 bad usage.',
].join('\n');

const SEARCH_LIMIT = 10;

function readOptions(flags) {
  if (flags.query === undefined || flags.query.trim() === '') throw new UsageError('give a --query <text>');
  if (flags.limit !== undefined && !POSITIVE_INTEGER.test(flags.limit)) throw new UsageError(`--limit needs a positive integer, got '${flags.limit}'`);
  return {
    query: flags.query.trim(),
    limit: flags.limit === undefined ? SEARCH_LIMIT : Number(flags.limit),
    newest: Boolean(flags.newest),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
  };
}

function searchArgs({ query, limit, newest }) {
  const prefix = newest ? 'ytsearchdate' : 'ytsearch';
  return ['--dump-json', '--skip-download', '--no-warnings', '--', `${prefix}${limit}:${query}`];
}

function uploadedAt(entry) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(String(entry.upload_date ?? ''));
  if (compact) return Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]));
  return Number.isFinite(entry.timestamp) ? entry.timestamp * 1000 : null;
}

export function viewsPerDay(entry, now) {
  const uploaded = uploadedAt(entry);
  if (uploaded === null || !Number.isFinite(entry.view_count)) return null;
  const days = Math.max(1, Math.floor((now - uploaded) / DAY_MS));
  return Math.round(entry.view_count / days);
}

function rowLine(entry, now) {
  const rate = viewsPerDay(entry, now);
  const fields = [entry.id, entryLine(entry, YOUTUBE)];
  if (rate !== null) fields.push(`${rate} views/day`);
  return fields.filter(Boolean).join(' | ');
}

function entriesOf(stdout) {
  return stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export async function searchVideos(options, now = Date.now()) {
  if (!(await ytDlpAvailable(options.ytDlpMs))) return { failure: `missing tool: searching needs yt-dlp on PATH; install it with ${YTDLP_INSTALL}, then rerun` };
  const run = await runYtDlpWithRuntime(searchArgs(options), options.ytDlpMs);
  if (run.error && !run.stdout) return { failure: `search failed: ${ytDlpReason(run, options)}` };
  const entries = entriesOf(run.stdout);
  if (entries.length === 0) return { failure: `no videos: yt-dlp found none for '${options.query}'` };
  return { lines: entries.map((entry) => rowLine(entry, now)) };
}

async function main(argv) {
  const options = readOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const result = await searchVideos(options);
  if (result.failure) {
    console.error(result.failure);
    return 1;
  }
  console.log(result.lines.join('\n'));
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(error.message);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    },
  );
}
