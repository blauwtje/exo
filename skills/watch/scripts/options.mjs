import path from 'node:path';
import { UsageError, environmentMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const SPEC = { url: 'list', lang: 'string', model: 'string', out: 'string', 'chunk-minutes': 'string', 'stamp-seconds': 'string', help: 'boolean' };
export const USAGE = [
  'usage: node transcript.mjs --url <url-or-id> [--url <url-or-id> ...] [--lang <code>] [--model <name-or-path>] [--out <dir>] [--chunk-minutes <n>] [--stamp-seconds <n>]',
  'Fetches the captions of each YouTube video, or of a TikTok, Instagram, Facebook, X or other video url through yt-dlp, with Node alone for YouTube and writes <out>/<id>/raw.xml and transcript.txt; a video longer than twice the chunk window also gets chunks/NN.txt.',
  'When YouTube refuses the request, and for any other site, yt-dlp reads the captions instead (raw.vtt). A yt-dlp on PATH is used; with none, the official release binary is fetched from GitHub, checked against its SHA2-256SUMS and cached under $CLAUDE_PLUGIN_DATA/bin (else ~/.cache/exo/bin); EXO_YTDLP names a binary to use instead.',
  'A video with no captions is transcribed locally from its audio: yt-dlp downloads it, ffmpeg converts it, and whisper-cli (when --model names an existing ggml file) or whisper writes raw.vtt; --lang then names the spoken language. EXO_WATCH_TRANSCRIBE_MS sets the wait for ffmpeg and the engine (default 1800000).',
  'Prints one line per video: id, title, duration, caption source, words, token estimate, paths. The transcript itself is never printed.',
  'Defaults: --out .exo/watch, --chunk-minutes 30, --stamp-seconds 45, --lang the language of the video\'s default audio (manual captions first, else automatic). EXO_WATCH_FETCH_MS sets the wait per request (default 30000); EXO_WATCH_YTDLP_MS sets the wait per yt-dlp call (default 120000).',
  'Exit codes: 0 every video done; 1 a video has no transcript (the message says why), a tool is missing or yt-dlp could not be fetched (`missing tool`, with its install command) or its language is missing; 2 bad usage.',
].join('\n');

export function readOptions(flags) {
  const urls = flags.url ?? [];
  if (urls.length === 0) throw new UsageError('give at least one --url <url-or-id>');
  for (const name of ['chunk-minutes', 'stamp-seconds']) {
    if (flags[name] !== undefined && !POSITIVE_INTEGER.test(flags[name])) throw new UsageError(`--${name} needs a positive integer, got '${flags[name]}'`);
  }
  return {
    urls,
    lang: flags.lang,
    model: flags.model,
    out: path.resolve(flags.out ?? DEFAULTS.out),
    chunkMinutes: Number(flags['chunk-minutes'] ?? DEFAULTS.chunkMinutes),
    stampSeconds: Number(flags['stamp-seconds'] ?? DEFAULTS.stampSeconds),
    fetchMs: environmentMs('EXO_WATCH_FETCH_MS', DEFAULTS.fetchMs),
    ytDlpMs: environmentMs('EXO_WATCH_YTDLP_MS', DEFAULTS.ytDlpMs),
    transcribeMs: environmentMs('EXO_WATCH_TRANSCRIBE_MS', DEFAULTS.transcribeMs),
  };
}
