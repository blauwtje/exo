#!/usr/bin/env node
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { RATE_LIMITED_EXIT, INSTALL, formatDuration, isRateLimited, reason, ytdlp, ytdlpMissing } from './ytdlp.mjs';

const USAGE = [
  'usage: node list.mjs --url <url> [--limit <n>]',
  'Lists the videos of a profile, channel or playlist (url, title, date, duration, views); downloads nothing. Default --limit 20.',
  'Exit codes: 0 listed; 75 rate limited; 1 failed or yt-dlp missing; 2 bad usage.'
].join('\n');

function flatten(entries = []) {
  return entries.flatMap((entry) => (entry?.entries ? flatten(entry.entries) : entry ? [entry] : []));
}

function line(entry) {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(entry.upload_date ?? '')?.slice(1).join('-')
    ?? (Number.isFinite(entry.timestamp) ? new Date(entry.timestamp * 1000).toISOString().slice(0, 10) : '');
  const views = Number.isFinite(entry.view_count) ? `${entry.view_count} views` : '';
  const duration = Number.isFinite(entry.duration) ? formatDuration(entry.duration) : '';
  return [entry.webpage_url || entry.url || entry.id, entry.title, date, duration, views].filter(Boolean).join(' | ');
}

async function main(argv) {
  const flags = parseFlags(argv, { url: 'string', limit: 'string' }, { usage: USAGE });
  if (!flags.url) throw new UsageError('give a --url <url>');
  const limit = Number(flags.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError('--limit needs a positive integer');
  if (await ytdlpMissing()) {
    console.error(`${flags.url}: missing tool: listing needs yt-dlp on PATH; install it with ${INSTALL}, then rerun`);
    return 1;
  }
  const result = await ytdlp(['--flat-playlist', '--extractor-args', 'youtubetab:approximate_date', '--dump-single-json', '--playlist-end', String(limit), '--', flags.url]);
  if (result.error) {
    console.error(`${flags.url}: list failed: ${reason(result)}`);
    return isRateLimited(result) ? RATE_LIMITED_EXIT : 1;
  }
  const entries = flatten(JSON.parse(result.stdout).entries).slice(0, limit);
  if (entries.length === 0) {
    console.error(`${flags.url}: no entries: yt-dlp lists no videos for it`);
    return 1;
  }
  console.log(entries.map(line).join('\n'));
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
