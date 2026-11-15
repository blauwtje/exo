#!/usr/bin/env node

import process from 'node:process';
import { parseLine } from '#basics';
import { limitLifetime } from '#lifetime';
import { UsageError, POSITIVE_INTEGER, environmentMs, parseFlags, isMain } from '#script-flags';
import { classifyOutsideFailure } from '../../../lib/outside-limit.mjs';
import { DEFAULTS } from './defaults.mjs';
import { formatDuration } from './format.mjs';
import { RATE_LIMITED_EXIT } from './request-gate.mjs';
import { runYtDlpWithRuntime, ytDlpReason, ytDlpAvailable } from './ytdlp.mjs';
import { urlOf, WATCH_URL, YOUTUBE_HOST } from './video-url.mjs';

const SPEC = { url: 'string', limit: 'string', help: 'boolean' };
const USAGE = [
  'usage: node list.mjs --url <url> [--limit <n>]',
  'Lists the videos of a TikTok, YouTube, Instagram or X profile, a YouTube channel or playlist, or another page yt-dlp lists, from metadata alone through yt-dlp: nothing is downloaded or written to disk.',
  'Prints one line per video: url, title, upload date, duration and view count, each only when known, then a summary line with the count and the profile title. Give the printed urls to transcript.mjs.',
  'Defaults: --limit 20. EXO_WATCH_YTDLP_MS sets the wait for yt-dlp (default 120000).',
  'Exit codes: 0 listed; 75 a rate limit (HTTP 429) stopped the listing; 1 yt-dlp failed, listed nothing or is missing (`missing tool`, with its install command); 2 bad usage.',
].join('\n');

function profileUrl(text) {
  if (text === undefined) throw new UsageError('give a --url <url>');
  const url = urlOf(text.trim());
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw new UsageError(`--url needs an http(s) profile url, got '${text}'`);
  return url.href;
}

function limitOf(text) {
  if (text === undefined) return DEFAULTS.listLimit;
  if (!POSITIVE_INTEGER.test(text)) throw new UsageError(`--limit needs a positive integer, got '${text}'`);
  return Number(text);
}

function readListOptions(flags) {
  return {
    url: profileUrl(flags.url),
    limit: limitOf(flags.limit),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
  };
}

const MISSING = "listing a profile needs yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun";

function flattened(entries = []) {
  return entries.flatMap((entry) => {
    if (!entry) return [];
    return entry.entries ? flattened(entry.entries) : [entry];
  });
}

function absolute(link, base) {
  if (!URL.canParse(link, base)) return '';
  return new URL(link, base).href;
}

function urlOfEntry(entry, base) {
  const link = entry.webpage_url || entry.url;
  if (link) return absolute(link, base);
  if (!entry.id) return '';
  if (YOUTUBE_HOST.test(new URL(base).hostname)) return `${WATCH_URL}${entry.id}`;
  return String(entry.id);
}

function dateOf(entry) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(String(entry.upload_date ?? ''));
  if (compact) return compact.slice(1).join('-');
  if (!Number.isFinite(entry.timestamp)) return '';
  return new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
}

function durationOf(entry) {
  return Number.isFinite(entry.duration) ? formatDuration(entry.duration) : '';
}

function viewsOf(entry) {
  return Number.isFinite(entry.view_count) ? `${entry.view_count} views` : '';
}

function entryLine(entry, base) {
  return [urlOfEntry(entry, base), entry.title, dateOf(entry), durationOf(entry), viewsOf(entry)].filter(Boolean).join(' | ');
}

function summaryLine(count, root) {
  const title = root.title || root.uploader || root.channel;
  return `${count} ${count === 1 ? 'entry' : 'entries'}${title ? ` from ${title}` : ''}`;
}

function listArgs({ url, limit }) {
  return ['--flat-playlist', '--dump-single-json', '--playlist-end', String(limit), '--no-warnings', '--', url];
}

async function listProfile(options) {
  if (!(await ytDlpAvailable(options.ytDlpMs))) return { failure: `${options.url}: missing tool: ${MISSING}` };
  const run = await runYtDlpWithRuntime(listArgs(options), options.ytDlpMs);
  if (run.error) {
    const rateLimited = classifyOutsideFailure({ text: run.stderr }) === 'rate-limited';
    return { failure: `${options.url}: list failed: ${ytDlpReason(run, options)}`, rateLimited };
  }
  const root = parseLine(run.stdout);
  if (!root) return { failure: `${options.url}: list failed: yt-dlp printed no listing` };
  const entries = flattened(root.entries).slice(0, options.limit);
  if (entries.length === 0) return { failure: `${options.url}: no entries: yt-dlp lists no videos for it` };
  return { lines: [...entries.map((entry) => entryLine(entry, options.url)), summaryLine(entries.length, root)] };
}

async function main(argv) {
  limitLifetime('watch-list', 1800000);
  const options = readListOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const result = await listProfile(options);
  if (result.failure) {
    console.error(result.failure);
    return result.rateLimited ? RATE_LIMITED_EXIT : 1;
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
