import { UsageError, environmentMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { urlOf } from './video-url.mjs';

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const SPEC = { url: 'string', limit: 'string', help: 'boolean' };
export const USAGE = [
  'usage: node list.mjs --url <url> [--limit <n>]',
  'Lists the videos of a TikTok, YouTube, Instagram or X profile, a YouTube channel or playlist, or another page yt-dlp lists, from metadata alone through yt-dlp: nothing is downloaded or written to disk.',
  'Prints one line per video: url, title, upload date, duration and view count, each only when known, then a summary line with the count and the profile title. Give the printed urls to transcript.mjs.',
  'Defaults: --limit 20. EXO_WATCH_YTDLP_MS sets the wait for yt-dlp (default 120000).',
  'Exit codes: 0 listed; 1 yt-dlp failed, listed nothing or is missing (`missing tool`, with its install command); 2 bad usage.',
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

export function readListOptions(flags) {
  return {
    url: profileUrl(flags.url),
    limit: limitOf(flags.limit),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
  };
}
