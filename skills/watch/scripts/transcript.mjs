#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain, environmentMs } from '#script-flags';
import { RATE_LIMITED_EXIT, INSTALL, formatDuration, isRateLimited, reason, run, ytdlp, ytdlpMissing } from './ytdlp.mjs';
import { onPath } from '#basics';
import { scratchPath } from '#scratch-path';

const USAGE = [
  'usage: node transcript.mjs --url <url> [--url <url> ...] [--from <file|->] [--lang <code>] [--model <whisper model>] [--force]',
  'Reads captions, or transcribes the audio locally when there are none, and writes <temp folder>/exo-<user>/<checkout>/watch/<id>/transcript.txt; prints one line per video.',
  'Exit codes: 0 done; 75 rate limited; 1 every video failed; 2 bad usage.'
].join('\n');

const CHUNK_SECONDS = 900;
const TOKENS_PER_WORD = 1.3;
const TIME = /(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3}) --> /;

export function parseVtt(text) {
  const cues = [];
  for (const block of text.replaceAll('\r\n', '\n').split(/\n\n+/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => TIME.test(line));
    if (at === -1) continue;
    const [, hours = 0, minutes, seconds] = lines[at].match(TIME);
    const body = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]|♪/g, ' ').replace(/\s+/g, ' ').trim();
    if (body) cues.push({ start: Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds), text: body });
  }
  return cues.filter((cue, index) => cue.text !== cues[index - 1]?.text);
}

function stamp(seconds, id, youtube) {
  const label = formatDuration(seconds);
  return youtube ? `[${label}](https://youtu.be/${id}?t=${Math.floor(seconds)})` : `[${label}]`;
}

function render(cues, id, youtube) {
  return cues.map((cue) => `${stamp(cue.start, id, youtube)} ${cue.text}`).join('\n') + '\n';
}

function idOf(url) {
  return url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? url.match(/[\w-]+(?=\/?(?:\?.*)?$)/)?.[0] ?? 'video';
}

function pickLanguage(info, wanted) {
  const manual = Object.keys(info.subtitles ?? {});
  const auto = Object.keys(info.automatic_captions ?? {});
  const all = [...new Set([...manual, ...auto])];
  if (all.length === 0) return { none: true };
  const language = wanted ?? info.language ?? 'en';
  const match = all.find((code) => code === language) ?? all.find((code) => code.split('-')[0] === language.split('-')[0] && !code.includes('orig'));
  if (!match) return { available: all };
  return { code: match, source: manual.includes(match) ? 'manual' : 'auto' };
}

function chunk(dir, cues, id, youtube) {
  const folder = path.join(dir, 'chunks');
  fs.mkdirSync(folder, { recursive: true });
  const parts = Map.groupBy(cues, (cue) => Math.floor(cue.start / CHUNK_SECONDS));
  [...parts.values()].forEach((part, index) => fs.writeFileSync(path.join(folder, `${String(index + 1).padStart(2, '0')}.txt`), render(part, id, youtube)));
  return `${folder} (${parts.size} files)`;
}

async function captionsOf(url, dir, code) {
  const result = await ytdlp(['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', code, '--sub-format', 'vtt', '--no-playlist', '-P', dir, '-o', 'captions', '--', url]);
  const file = fs.readdirSync(dir).find((name) => name.startsWith('captions') && name.endsWith('.vtt'));
  if (!file) return { failure: `no captions downloaded: ${result.error ? reason(result) : 'yt-dlp wrote none'}` };
  return { vtt: fs.readFileSync(path.join(dir, file), 'utf8') };
}

const SPEECH_MS = environmentMs('EXO_WATCH_TRANSCRIBE_MS', 3600000);
const AUDIO = 'bestaudio[ext=mp3]/bestaudio[ext=wav]/bestaudio[ext=flac]/bestaudio/best';

async function transcribe(url, dir, { lang, model }) {
  const modelFile = model ?? process.env.EXO_WHISPER_MODEL;
  const engine = (modelFile && onPath('whisper-cli')) ? 'whisper-cli' : onPath('whisper') ? 'whisper' : null;
  if (!engine) return { missing: 'a local speech engine: install whisper.cpp (whisper-cli, with --model <ggml file>) or openai-whisper (whisper)' };
  const download = await ytdlp(['-f', AUDIO, '--no-playlist', '-P', dir, '-o', 'audio.%(ext)s', '--', url]);
  const audio = fs.readdirSync(dir).find((file) => file.startsWith('audio.'));
  if (download.error || !audio) return { failure: `audio download failed: ${reason(download)}` };
  const file = path.join(dir, audio);
  const language = lang?.split('-')[0].toLowerCase();
  const args = engine === 'whisper-cli'
    ? ['-m', modelFile, '-f', file, '-l', language ?? 'auto', '-ovtt', '-of', path.join(dir, 'speech')]
    : [file, '--output_format', 'vtt', '--output_dir', dir, ...(language ? ['--language', language] : []), ...(model ? ['--model', model] : [])];
  const result = await run(engine, args, SPEECH_MS);
  fs.rmSync(file, { force: true });
  const vtt = [path.join(dir, 'speech.vtt'), path.join(dir, 'audio.vtt')].find((candidate) => fs.existsSync(candidate));
  if (result.error || !vtt) return { failure: `${engine} failed: ${result.error ? reason(result) : 'it wrote no captions'}` };
  return { vtt: fs.readFileSync(vtt, 'utf8'), engine };
}

async function one(url, options) {
  const id = idOf(url);
  const dir = path.join(options.out, id);
  const transcript = path.join(dir, 'transcript.txt');
  const done = path.join(dir, 'line.txt');
  if (!options.force && fs.existsSync(done)) return { line: fs.readFileSync(done, 'utf8').trim() };
  const info = await ytdlp(['--dump-json', '--no-playlist', '--', url]);
  if (info.error) return { failure: `${url}: ${reason(info)}`, rateLimited: isRateLimited(info) };
  const meta = JSON.parse(info.stdout);
  fs.mkdirSync(dir, { recursive: true });
  const language = pickLanguage(meta, options.lang);
  let vtt;
  let source;
  if (language.available) return { failure: `${url}: no captions in language '${options.lang}'; available: ${language.available.join(', ')}. Rerun with --lang <code> set to one of them.` };
  if (language.code) {
    const captions = await captionsOf(url, dir, language.code);
    if (captions.failure) return { failure: `${url}: ${captions.failure}`, rateLimited: isRateLimited({ stderr: captions.failure }) };
    ({ vtt } = captions);
    source = language.source;
  } else {
    const speech = await transcribe(url, dir, options);
    if (speech.missing) return { failure: `${url}: missing tool: the video has no captions, and transcribing its audio needs ${speech.missing}` };
    if (speech.failure) return { failure: `${url}: no transcript: the video has no captions, and ${speech.failure}` };
    ({ vtt } = speech);
    source = `speech:${speech.engine}`;
  }
  const cues = parseVtt(vtt);
  if (cues.length === 0) return { failure: `${url}: no transcript: no speech in this video` };
  const youtube = /youtu/.test(meta.extractor ?? '') || /youtu/.test(url);
  fs.writeFileSync(transcript, render(cues, id, youtube));
  const words = cues.reduce((sum, cue) => sum + cue.text.split(' ').length, 0);
  const fields = { id, title: JSON.stringify(meta.title ?? ''), duration: formatDuration(meta.duration ?? cues.at(-1).start), captions: source, words, tokens: Math.round(words * TOKENS_PER_WORD), transcript };
  if ((meta.duration ?? 0) > CHUNK_SECONDS * 2) fields.chunks = chunk(dir, cues, id, youtube);
  const line = Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ');
  fs.writeFileSync(done, `${line}\n`);
  return { line };
}

function urlsOf(flags) {
  const listed = flags.from === undefined ? [] : fs.readFileSync(flags.from === '-' ? 0 : flags.from, 'utf8').split('\n').map((entry) => entry.split(' | ')[0].trim()).filter((entry) => /^https?:\/\//.test(entry));
  return [...(flags.url ?? []), ...listed];
}

async function main(argv) {
  const flags = parseFlags(argv, { url: 'list', from: 'string', lang: 'string', model: 'string', force: 'boolean' }, { usage: USAGE });
  const urls = urlsOf(flags);
  if (urls.length === 0) throw new UsageError('give a --url <url> or --from <file>');
  if (await ytdlpMissing()) {
    console.error(`missing tool: yt-dlp on PATH; install it with ${INSTALL}, then rerun`);
    return 1;
  }
  const options = { out: scratchPath(process.cwd(), 'watch'), lang: flags.lang, model: flags.model, force: flags.force };
  let failed = 0;
  for (const [index, url] of urls.entries()) {
    const result = await one(url, options);
    if (result.line) console.log(result.line);
    if (!result.failure) continue;
    failed += 1;
    console.error(result.failure);
    if (!result.rateLimited) continue;
    console.error(`rate-limited, retry later: ${urls.slice(index).join(' ')}`);
    return RATE_LIMITED_EXIT;
  }
  return failed === urls.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
