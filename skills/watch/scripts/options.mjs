import path from 'node:path';
import { UsageError, environmentMs, environmentDelayMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const SPEC = { url: 'list', from: 'list', force: 'boolean', lang: 'string', model: 'string', out: 'string', 'chunk-minutes': 'string', 'stamp-seconds': 'string', help: 'boolean' };
export const USAGE = [
  'usage: node transcript.mjs (--url <url-or-id> [--url <url-or-id> ...] | --from <file-or-->) [--force] [--lang <code>] [--model <name-or-path>] [--out <dir>] [--chunk-minutes <n>] [--stamp-seconds <n>]',
  'Fetches the captions of each YouTube video, or of a TikTok, Instagram, Facebook, X or other video url through yt-dlp, with Node alone for YouTube and writes <out>/<id>/raw.xml and transcript.txt; a video longer than twice the chunk window also gets chunks/NN.txt.',
  'When YouTube refuses the request, and for any other site, yt-dlp reads the captions instead (raw.vtt). A yt-dlp on PATH is used; with none, the official release binary is fetched from GitHub, checked against its SHA2-256SUMS and cached under $CLAUDE_PLUGIN_DATA/bin (else ~/.cache/exo/bin); EXO_YTDLP names a binary to use instead.',
  'A video with no captions is transcribed locally from its audio: yt-dlp downloads it (mp3, wav or flac as is, any other format through the bundled decoder) and the first engine found wins: whisper-cli, then whisper, else whisper.node, which is fetched on first use into $CLAUDE_PLUGIN_DATA/npm/whisper (else ~/.cache/exo/npm/whisper) together with the pinned ggml-base-q5_1 model (60 MB, checked against its SHA-256 and cached under models/). --model names an existing ggml file for whisper-cli or a model name for whisper; --lang names the spoken language, else it is detected. A video without speech gets the one-line transcript `no speech in this video`. EXO_WATCH_TRANSCRIBE_MS sets the wait for the engine (default 1800000).',
  'A batch runs the videos one by one, never in parallel: repeat --url, and/or give --from a file with one url per line (blank lines and anything after the first whitespace are ignored, so the output of list.mjs works as is), or --from - to read the urls from stdin. A video already finished under <out> is skipped with a `skipped` line unless --force; only a run that finished marks a video done (<out>/done.jsonl), so a crashed one is redone. A batch of two or more videos ends with one line: `batch done=<n> skipped=<n> failed=<n>`, then ` | <failure> (<id>, <id>)` for each distinct failure.',
  'Prints one line per video: id, title, duration, caption source, words, token estimate, paths. The transcript itself is never printed.',
  'Defaults: --out .exo/watch, --chunk-minutes 30, --stamp-seconds 45, --lang the language of the video\'s default audio (manual captions first, else automatic). EXO_WATCH_FETCH_MS sets the wait per request (default 30000); EXO_WATCH_YTDLP_MS sets the wait per yt-dlp call (default 120000).',
  'Exit codes: 75 a rate limit (HTTP 429) stopped the batch and the wait of EXO_WATCH_RATE_WAIT_MS ran out: the last line gives the open videos and the restart command; 0 at least one video done or skipped; 1 every video failed (a video has no transcript (the message says why), a tool is missing or yt-dlp could not be fetched (`missing tool`, with its install command) or its language is missing); a failed video does not stop the batch and its message goes to stderr; 2 bad usage or an unreadable --from file.',
].join('\n');

export function readOptions(flags, listed = []) {
  const urls = [...(flags.url ?? []), ...listed];
  if (urls.length === 0) throw new UsageError('give at least one --url <url-or-id> or --from <file>');
  for (const name of ['chunk-minutes', 'stamp-seconds']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  return {
    urls,
    force: flags.force === true,
    lang: flags.lang,
    model: flags.model,
    out: path.resolve(flags.out ?? DEFAULTS.out),
    chunkMinutes: Number(flags['chunk-minutes'] ?? DEFAULTS.chunkMinutes),
    stampSeconds: Number(flags['stamp-seconds'] ?? DEFAULTS.stampSeconds),
    fetchMs: environmentMs('EXO_WATCH_FETCH_MS', DEFAULTS.fetchMs),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
    transcribeMs: environmentMs('EXO_WATCH_TRANSCRIBE_MS', DEFAULTS.transcribeMs),
    rateWaitMs: environmentDelayMs('EXO_WATCH_RATE_WAIT_MS', DEFAULTS.rateWaitMs),
    backoffMs: environmentDelayMs('EXO_WATCH_BACKOFF_MS', DEFAULTS.retryBackoffMs),
  };
}
