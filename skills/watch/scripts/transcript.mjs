#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { UsageError, parseFlags, isMain, environmentMs } from '#script-flags';
import { transcribe } from './speech.mjs';

const SPEC = { url: 'list', lang: 'string', model: 'string', out: 'string', 'chunk-minutes': 'string', 'stamp-seconds': 'string', help: 'boolean' };
const USAGE = [
  'usage: node transcript.mjs --url <url-or-id> [--url <url-or-id> ...] [--lang <code>] [--model <name-or-path>] [--out <dir>] [--chunk-minutes <n>] [--stamp-seconds <n>]',
  'Fetches the captions of each YouTube video, or of a TikTok, Instagram, Facebook, X or other video url through yt-dlp, with Node alone for YouTube and writes <out>/<id>/raw.xml and transcript.txt; a video longer than twice the chunk window also gets chunks/NN.txt.',
  'When YouTube refuses the request and yt-dlp is already on PATH, yt-dlp reads the captions instead (raw.vtt); nothing is ever installed.',
  'A video with no captions is transcribed locally from its audio: yt-dlp downloads it, ffmpeg converts it, and whisper-cli (when --model names an existing ggml file) or whisper writes raw.vtt; --lang then names the spoken language. EXO_WATCH_TRANSCRIBE_MS sets the wait for ffmpeg and the engine (default 1800000).',
  'Prints one line per video: id, title, duration, caption source, words, token estimate, paths. The transcript itself is never printed.',
  'Defaults: --out .exo/watch, --chunk-minutes 30, --stamp-seconds 45, --lang the language of the video\'s default audio (manual captions first, else automatic). EXO_WATCH_FETCH_MS sets the wait per request (default 30000); EXO_WATCH_YTDLP_MS sets the wait per yt-dlp call (default 120000).',
  'Exit codes: 0 every video done; 1 a video has no transcript (the message says why) or its language is missing; 2 bad usage.',
].join('\n');

const DEFAULTS = { out: '.exo/watch', chunkMinutes: 30, stampSeconds: 45, fetchMs: 30000, ytDlpMs: 120000, transcribeMs: 1800000 };
const TOKENS_PER_WORD = 1.3;
const HOUR = 3600;
const LAST_CODE_POINT = 0x10ffff;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
const ID_FOLDERS = new Set(['shorts', 'embed', 'live', 'v']);
const TIMING = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s+-->/;
const ENTITY = /&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi;
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
const WATCH_URL = 'https://www.youtube.com/watch?v=';
const JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`];
const UNKNOWN_RUNTIME_OPTION = /no such option: --js-runtimes|unrecognized arguments:.*--js-runtimes/;
const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38' };
const ANDROID_AGENT = `com.google.android.youtube/${ANDROID_CLIENT.clientVersion} (Linux; U; Android 14)`;
const INITIAL_DATA = 'var ytInitialData = ';
const TIMED_TEXT_FORMATS = [
  { pattern: /<p\s([^>]*[^>/])>([\s\S]*?)<\/p>/g, start: /\bt="(\d+)"/, perSecond: 1000 },
  { pattern: /<text\s([^>]*[^>/])>([\s\S]*?)<\/text>/g, start: /\bstart="(\d+(?:\.\d+)?)"/, perSecond: 1 },
];

function decodeEntity(match, name, decimal, hex) {
  if (name) return ENTITIES[`&${name};`] ?? match;
  const code = decimal ? Number(decimal) : parseInt(hex, 16);
  return code > 0 && code <= LAST_CODE_POINT ? String.fromCodePoint(code) : match;
}

export function decodeEntities(text) {
  return text.replace(ENTITY, decodeEntity);
}

function cueStart(line) {
  const match = TIMING.exec(line);
  if (!match) return null;
  const [, hours = '0', minutes, seconds, millis] = match;
  return Number(hours) * HOUR + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function cleanLine(line) {
  return decodeEntities(line.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function parseVtt(vtt, { auto = false } = {}) {
  const cues = [];
  let previous = '';
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingAt = lines.findIndex((line) => line.includes('-->'));
    const start = timingAt < 0 ? null : cueStart(lines[timingAt]);
    if (start === null) continue;
    for (const line of lines.slice(timingAt + 1).map(cleanLine)) {
      if (line === '' || (auto && line === previous)) continue;
      cues.push({ start, text: line });
      previous = line;
    }
  }
  return cues;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

export function formatStamp(seconds, withHours) {
  const whole = Math.floor(seconds);
  if (!withHours) return `[${pad(Math.floor(whole / 60))}:${pad(whole % 60)}]`;
  return `[${Math.floor(whole / HOUR)}:${pad(Math.floor((whole % HOUR) / 60))}:${pad(whole % 60)}]`;
}

export function formatDuration(seconds) {
  return formatStamp(seconds, true).slice(1, -1);
}

export function renderTranscript(cues, { chapters = [], stampSeconds = DEFAULTS.stampSeconds, withHours = false } = {}) {
  const output = [];
  let nextStamp = 0;
  let paragraph = null;
  let chapterAt = 0;
  const flush = () => {
    if (paragraph) output.push(paragraph.join(' '));
    paragraph = null;
  };
  for (const cue of cues) {
    while (chapterAt < chapters.length && chapters[chapterAt].start <= cue.start) {
      flush();
      output.push(`## ${chapters[chapterAt].title}`);
      nextStamp = 0;
      chapterAt += 1;
    }
    if (!paragraph || cue.start >= nextStamp) {
      flush();
      paragraph = [formatStamp(cue.start, withHours)];
      nextStamp = cue.start + stampSeconds;
    }
    paragraph.push(cue.text);
  }
  flush();
  return `${output.join('\n\n')}\n`;
}

export function countWords(cues) {
  return cues.reduce((total, cue) => total + cue.text.split(' ').length, 0);
}

function packSegments(segments, windowSeconds) {
  const packed = [];
  let current = null;
  for (const segment of segments) {
    if (current && current.end - current.start >= windowSeconds) {
      packed.push(current);
      current = null;
    }
    current = current ? { ...current, end: segment.end, last: segment.title } : { start: segment.start, end: segment.end, first: segment.title, last: segment.title };
  }
  if (current) packed.push(current);
  return packed;
}

function foldTail(packed, windowSeconds) {
  const tail = packed.at(-1);
  if (packed.length < 2 || tail.end - tail.start >= windowSeconds / 2) return packed;
  const before = packed.at(-2);
  return [...packed.slice(0, -2), { ...before, end: tail.end, last: tail.last }];
}

function splitEvenly(chunk, windowSeconds) {
  const title = chunk.first === chunk.last ? chunk.first : `${chunk.first} to ${chunk.last}`;
  const length = chunk.end - chunk.start;
  const parts = length > windowSeconds * 1.5 ? Math.ceil(length / windowSeconds) : 1;
  if (parts === 1) return [{ start: chunk.start, end: chunk.end, title }];
  const step = length / parts;
  return Array.from({ length: parts }, (_, index) => ({
    start: chunk.start + step * index,
    end: index === parts - 1 ? chunk.end : chunk.start + step * (index + 1),
    title: `${title} (part ${index + 1}/${parts})`,
  }));
}

function closeGaps(chunks, duration) {
  return chunks.map((chunk, index) => ({
    ...chunk,
    start: index === 0 ? 0 : chunk.start,
    end: index === chunks.length - 1 ? Math.max(chunk.end, duration) : chunks[index + 1].start,
  }));
}

export function planChunks(duration, chapters, windowSeconds) {
  const segments = chapters.length > 0
    ? chapters.map((chapter) => ({ start: chapter.start, end: chapter.end, title: chapter.title }))
    : [{ start: 0, end: duration, title: 'Part' }];
  const packed = foldTail(packSegments(segments, windowSeconds), windowSeconds);
  return closeGaps(packed.flatMap((chunk) => splitEvenly(chunk, windowSeconds)), duration);
}

function usableKeys(tracks) {
  return Object.keys(tracks ?? {}).filter((key) => key !== 'live_chat' && tracks[key]?.length > 0);
}

export function availableLanguages(info) {
  return [...new Set([info.subtitles, info.automatic_captions].flatMap(usableKeys))];
}

function trackKey(tracks, wanted, preferOriginal = false) {
  const keys = usableKeys(tracks);
  if (keys.length === 0) return null;
  if (wanted) {
    const original = keys.find((key) => key === `${wanted}-orig`);
    return (preferOriginal ? original : undefined)
      ?? keys.find((key) => key === wanted)
      ?? original
      ?? keys.find((key) => key.startsWith(`${wanted}-`))
      ?? null;
  }
  return keys.find((key) => key.endsWith('-orig')) ?? keys.find((key) => key.startsWith('en')) ?? keys[0];
}

function chooseTrack(tracks, language, preferOriginal) {
  return trackKey(tracks, language, preferOriginal) ?? trackKey(tracks, null);
}

export function pickCaptions(info, lang) {
  const wanted = lang ?? info.language ?? null;
  const manual = lang ? trackKey(info.subtitles, lang) : chooseTrack(info.subtitles, wanted);
  if (manual) return { source: 'manual', key: manual };
  const auto = lang ? trackKey(info.automatic_captions, lang, true) : chooseTrack(info.automatic_captions, wanted, true);
  if (auto) return { source: 'auto', key: auto };
  return null;
}

function runYtDlp(args, timeout) {
  return new Promise((resolve) => {
    execFile('yt-dlp', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function runYtDlpWithRuntime(args, timeout) {
  const run = await runYtDlp([...JS_RUNTIME, ...args], timeout);
  if (!run.error || !UNKNOWN_RUNTIME_OPTION.test(run.stderr)) return run;
  return runYtDlp(args, timeout);
}

function lastLine(text) {
  return text.trim().split('\n').pop() ?? '';
}

function ytDlpReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.ytDlpMs / 1000} s`;
  return lastLine(run.stderr) || run.error?.message || 'no error text';
}

export async function ytDlpAvailable(timeout) {
  const { error } = await runYtDlp(['--version'], timeout);
  return !(error && error.code === 'ENOENT');
}

class Unreadable extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function hasScheme(text) {
  return SCHEME.test(text) && text.slice(text.indexOf(':')).startsWith('://');
}

function urlOf(text) {
  try {
    return new URL(hasScheme(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

function idFromUrl(url) {
  if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] ?? '';
  if (!YOUTUBE_HOST.test(url.hostname)) return '';
  const [folder, id] = url.pathname.split('/').filter(Boolean);
  return ID_FOLDERS.has(folder) ? id : url.searchParams.get('v') ?? '';
}

export function videoIdOf(input) {
  const text = String(input).trim();
  if (VIDEO_ID.test(text)) return text;
  const url = urlOf(text);
  const id = url ? idFromUrl(url) : '';
  return VIDEO_ID.test(id) ? id : null;
}

function unanswered(url) {
  return (error) => {
    throw new Unreadable(`${url.split('?')[0]} did not answer: ${error.message}`, { retryable: true });
  };
}

async function request(fetchFn, url, init, options) {
  const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(options.fetchMs) }).catch(unanswered(url));
  if (response.status === 429) throw new Unreadable('YouTube answered 429, this network is rate limited', { retryable: true });
  if (!response.ok) throw new Unreadable(`YouTube answered HTTP ${response.status}`, { retryable: true });
  return response.text().catch(unanswered(url));
}

async function fetchPlayer(id, fetchFn, options) {
  const body = JSON.stringify({ context: { client: ANDROID_CLIENT }, videoId: id });
  const headers = { 'content-type': 'application/json', 'user-agent': ANDROID_AGENT };
  const text = await request(fetchFn, PLAYER_URL, { method: 'POST', headers, body }, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Unreadable('YouTube sent no player data', { retryable: true });
  }
}

async function fetchWatchPage(id, fetchFn, options) {
  return request(fetchFn, `${WATCH_URL}${id}`, { headers: { 'accept-language': 'en-US,en;q=0.9' } }, options).catch(() => '');
}

function checkPlayable(player) {
  const { status, reason = '' } = player.playabilityStatus ?? {};
  if (status === 'OK') return;
  if (status === 'LOGIN_REQUIRED' && /bot/i.test(reason)) throw new Unreadable('YouTube asks this network to sign in and prove it is not a bot', { retryable: true });
  const cannotPlay = `the video cannot be played (${status ?? 'no status'}${reason ? `: ${reason}` : ''})`;
  throw new Unreadable(cannotPlay, { retryable: status === 'UNPLAYABLE' });
}

export function tracksOf(player) {
  const listed = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return listed
    .filter((track) => YOUTUBE_HOST.test(urlOf(track.baseUrl ?? '')?.hostname ?? ''))
    .map((track) => ({ code: track.languageCode, auto: track.kind === 'asr', url: track.baseUrl }));
}

function defaultLanguage(player) {
  const renderer = player.captions?.playerCaptionsTracklistRenderer;
  const audio = renderer?.audioTracks?.[renderer.defaultAudioTrackIndex ?? 0];
  const spoken = renderer?.captionTracks?.find((track) => track.kind === 'asr');
  return audio?.audioTrackId?.split('.')[0] ?? spoken?.languageCode ?? null;
}

function sameLanguage(code, wanted) {
  return code === wanted || code.split('-')[0].toLowerCase() === wanted.split('-')[0].toLowerCase();
}

function closest(tracks, wanted) {
  return tracks.find((track) => track.code === wanted) ?? tracks.find((track) => sameLanguage(track.code, wanted)) ?? null;
}

function bestOf(tracks, wanted) {
  return (wanted && closest(tracks, wanted)) || tracks.find((track) => track.code.startsWith('en')) || tracks[0] || null;
}

export function pickTrack(tracks, lang, defaultCode = null) {
  const manual = tracks.filter((track) => !track.auto);
  const auto = tracks.filter((track) => track.auto);
  if (lang) return closest(manual, lang) ?? closest(auto, lang);
  return bestOf(manual, defaultCode) ?? bestOf(auto, defaultCode);
}

export function languagesOf(tracks) {
  return [...new Set(tracks.map((track) => track.code))];
}

function cuesOf(xml, { pattern, start, perSecond }, auto) {
  const cues = [];
  let previous = '';
  for (const [, attributes, inner] of xml.matchAll(pattern)) {
    const begin = start.exec(attributes);
    const text = decodeEntities(cleanLine(inner));
    if (!begin || text === '' || (auto && text === previous)) continue;
    cues.push({ start: Number(begin[1]) / perSecond, text });
    previous = text;
  }
  return cues;
}

export function parseTimedText(xml, { auto = false } = {}) {
  for (const format of TIMED_TEXT_FORMATS) {
    const cues = cuesOf(xml, format, auto);
    if (cues.length > 0) return cues;
  }
  return [];
}

function titleOf(text) {
  return text?.simpleText ?? text?.runs?.map((run) => run.text).join('') ?? '';
}

function panelMarkers(panel) {
  const items = panel.engagementPanelSectionListRenderer?.content?.macroMarkersListRenderer?.contents ?? [];
  return items.map((item) => item.macroMarkersListItemRenderer).filter(Boolean);
}

function firstMarkers(data) {
  return (data?.engagementPanels ?? []).map(panelMarkers).find((markers) => markers.length > 0) ?? [];
}

function initialDataOf(html) {
  const from = html.indexOf(INITIAL_DATA);
  if (from < 0) return null;
  const start = from + INITIAL_DATA.length;
  try {
    return JSON.parse(html.slice(start, html.indexOf(';</script>', start)));
  } catch {
    return null;
  }
}

export function chaptersFromHtml(html, duration) {
  const markers = firstMarkers(initialDataOf(html));
  const starts = new Map();
  for (const marker of markers) {
    const start = marker.onTap?.watchEndpoint?.startTimeSeconds;
    if (typeof start === 'number' && !starts.has(start)) starts.set(start, titleOf(marker.title).replace(/\s+/g, ' ').trim() || 'Chapter');
  }
  const ordered = [...starts].sort((a, b) => a[0] - b[0]);
  return ordered.map(([start, title], index) => ({ start, end: ordered[index + 1]?.[0] ?? duration, title }));
}

function chaptersOf(info) {
  return (info.chapters ?? []).map((chapter) => ({
    start: chapter.start_time,
    end: chapter.end_time,
    title: String(chapter.title ?? '').replace(/\s+/g, ' ').trim() || 'Chapter',
  }));
}

function writeChunks(dir, cues, { duration, chapters, withHours }, options) {
  const chunks = planChunks(duration, chapters, options.chunkMinutes * 60);
  const folder = path.join(dir, 'chunks');
  fs.mkdirSync(folder, { recursive: true });
  chunks.forEach((chunk, index) => {
    const last = index === chunks.length - 1;
    const inside = cues.filter((cue) => cue.start >= chunk.start && (last || cue.start < chunk.end));
    const named = chapters.filter((chapter) => chapter.end > chunk.start && (last || chapter.start < chunk.end));
    const header = `# ${chunk.title} ${formatStamp(chunk.start, withHours)}-${formatStamp(chunk.end, withHours)}\n\n`;
    const body = renderTranscript(inside, { chapters: named, stampSeconds: options.stampSeconds, withHours });
    fs.writeFileSync(path.join(folder, `${String(index + 1).padStart(2, '0')}.txt`), header + body);
  });
  return { folder, count: chunks.length };
}

function summaryLine(fields) {
  return Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ');
}

function writeOutputs({ dir, cues, duration, chapters, head, captions }, options) {
  const withHours = duration >= HOUR || (cues.at(-1)?.start ?? 0) >= HOUR;
  const transcript = path.join(dir, 'transcript.txt');
  fs.writeFileSync(transcript, renderTranscript(cues, { chapters, stampSeconds: options.stampSeconds, withHours }));
  const words = countWords(cues);
  const fields = { ...head, duration: formatDuration(duration), captions, words, tokens: Math.round(words * TOKENS_PER_WORD), transcript };
  if (duration > options.chunkMinutes * 120) {
    const chunks = writeChunks(dir, cues, { duration, chapters, withHours }, options);
    fields.chunks = `${chunks.folder} (${chunks.count} files)`;
  }
  return { line: summaryLine(fields) };
}

function headOf(id, title) {
  return { id, title: JSON.stringify(String(title ?? '').replace(/\s+/g, ' ').trim()) };
}

function languageFailure(id, lang, available) {
  return { failure: `${id}: no captions in language '${lang}'; available: ${available.join(', ')}. Rerun with --lang <code> set to one of them.` };
}

function noTranscript(id, reason) {
  return { failure: `${id}: no transcript: ${reason}` };
}

async function readCaptions(track, fetchFn, options) {
  if (/[?&]exp=xpe\b/.test(track.url)) throw new Unreadable('YouTube wants a proof-of-origin token for these captions', { retryable: true });
  const xml = await request(fetchFn, track.url, {}, options);
  if (xml.trim() === '') throw new Unreadable('YouTube sent an empty caption file', { retryable: true });
  const cues = parseTimedText(xml, { auto: track.auto });
  if (cues.length === 0) throw new Unreadable('YouTube sent a caption file with no text', { retryable: true });
  return { xml, cues };
}

async function watchBySpeech({ label, url, dir, head, details, why }, options) {
  const speech = await transcribe(url, dir, { ...options, runYtDlp: runYtDlpWithRuntime, ytDlpReason });
  const lead = why ? `${why}; ` : '';
  if (speech.missing) return noTranscript(label, `${lead}the video has no captions, and transcribing its audio needs ${speech.missing}, then rerun`);
  if (speech.failure) return noTranscript(label, `${lead}the video has no captions, and ${speech.failure}`);
  const cues = parseVtt(fs.readFileSync(speech.vtt, 'utf8'));
  if (cues.length === 0) return noTranscript(label, 'no speech found in the audio');
  const duration = details.duration > 0 ? details.duration : Math.ceil(cues.at(-1).start);
  const chapters = details.chapters(duration);
  return writeOutputs({ dir, cues, duration, chapters, head, captions: `speech:${speech.engine}` }, options);
}

async function watchDirect(id, options, fetchFn) {
  const [player, page] = await Promise.all([fetchPlayer(id, fetchFn, options), fetchWatchPage(id, fetchFn, options)]);
  checkPlayable(player);
  const tracks = tracksOf(player);
  const head = headOf(id, player.videoDetails?.title);
  const lengthSeconds = Number(player.videoDetails?.lengthSeconds);
  if (tracks.length === 0) {
    const details = { duration: lengthSeconds, chapters: (duration) => chaptersFromHtml(page, duration) };
    return watchBySpeech({ label: id, url: `${WATCH_URL}${id}`, dir: path.join(options.out, id), head, details }, options);
  }
  const track = pickTrack(tracks, options.lang, defaultLanguage(player));
  if (!track) return languageFailure(id, options.lang, languagesOf(tracks));
  const { xml, cues } = await readCaptions(track, fetchFn, options);
  const duration = lengthSeconds > 0 ? lengthSeconds : Math.ceil(cues.at(-1).start);
  const dir = path.join(options.out, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw.xml'), xml);
  const captions = `${track.auto ? 'auto' : 'manual'}:${track.code}`;
  return writeOutputs({ dir, cues, duration, chapters: chaptersFromHtml(page, duration), head, captions }, options);
}

function idSuffix(id) {
  if (!/[A-Z]/.test(id)) return '';
  return `-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`;
}

function folderOf(info) {
  const name = `${info.extractor_key.toLowerCase()}-${info.id}`.replace(/[^\w-]/g, '-');
  return `${name}${idSuffix(info.id)}`;
}

function ytDlpFailure(why, reason) {
  return why ? `${why}; yt-dlp failed too: ${reason}` : `yt-dlp failed: ${reason}`;
}

async function watchWithYtDlp({ id, url }, options, why) {
  const label = id ?? url;
  const meta = await runYtDlpWithRuntime(['-J', '--no-playlist', '--no-warnings', '--', url], options.ytDlpMs);
  if (meta.error) return noTranscript(label, ytDlpFailure(why, ytDlpReason(meta, options)));
  const answer = JSON.parse(meta.stdout);
  const info = answer._type === 'playlist' ? answer.entries[0] : answer;
  if (!info) return noTranscript(label, ytDlpFailure(why, 'it found no video'));
  const folder = id ?? folderOf(info);
  const picked = pickCaptions(info, options.lang);
  const available = availableLanguages(info);
  if (!picked && options.lang && available.length > 0) return languageFailure(folder, options.lang, available);
  const dir = path.join(options.out, folder);
  if (!picked) {
    const details = { duration: info.duration, chapters: () => chaptersOf(info) };
    return watchBySpeech({ label: folder, url, dir, head: headOf(folder, info.title), details, why }, options);
  }
  fs.mkdirSync(dir, { recursive: true });
  const flag = picked.source === 'manual' ? '--write-subs' : '--write-auto-subs';
  const download = await runYtDlpWithRuntime(['--skip-download', flag, '--sub-langs', picked.key, '--sub-format', 'vtt', '--no-warnings', '--no-playlist', '--playlist-items', '1', '-P', dir, '-o', '%(id)s.%(ext)s', '--', url], options.ytDlpMs);
  const vttName = fs.readdirSync(dir).find((name) => name.startsWith(`${info.id}.`) && name.endsWith('.vtt'));
  if (!vttName) return noTranscript(folder, `${why ? `${why}; ` : ''}yt-dlp wrote no ${picked.key} captions: ${ytDlpReason(download, options)}`);
  const raw = path.join(dir, 'raw.vtt');
  fs.renameSync(path.join(dir, vttName), raw);
  const cues = parseVtt(fs.readFileSync(raw, 'utf8'), { auto: picked.source === 'auto' });
  const duration = info.duration ?? Math.ceil(cues.at(-1)?.start ?? 0);
  return writeOutputs({ dir, cues, duration, chapters: chaptersOf(info), head: headOf(folder, info.title), captions: `${picked.source}:${picked.key}` }, options);
}

export function sourceOf(input) {
  const text = String(input).trim();
  const id = videoIdOf(text);
  if (id) return { id };
  const url = urlOf(text);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  if (!hasScheme(text) && (!url.hostname.includes('.') || url.username || url.password)) return null;
  if (YOUTUBE_HOST.test(url.hostname) || url.hostname === 'youtu.be') return null;
  return { url: url.href, host: url.hostname };
}

async function watchSite({ url, host }, options) {
  if (!(await ytDlpAvailable(options.ytDlpMs))) {
    return noTranscript(url, `reading ${host} videos needs yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun`);
  }
  return watchWithYtDlp({ url }, options);
}

export async function watchOne(input, options, fetchFn = globalThis.fetch) {
  const source = sourceOf(input);
  if (!source) return { failure: `${input}: not a video url or an 11-character YouTube id` };
  if (!source.id) return watchSite(source, options);
  const { id } = source;
  try {
    return await watchDirect(id, options, fetchFn);
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    if (!error.retryable || !(await ytDlpAvailable(options.ytDlpMs))) return noTranscript(id, error.message);
    return watchWithYtDlp({ id, url: `${WATCH_URL}${id}` }, options, error.message);
  }
}

function readOptions(flags) {
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

function guarded(label, work) {
  return Promise.resolve().then(work).catch((error) => ({ failure: `${label}: ${error.message}` }));
}

export function watchAll(options, fetchFn = globalThis.fetch) {
  return Promise.all(options.urls.map((url) => guarded(url, () => watchOne(url, options, fetchFn))));
}

async function main(argv) {
  const options = readOptions(parseFlags(argv, SPEC, { usage: USAGE }));
  const results = await watchAll(options);
  for (const result of results) {
    if (result.line) console.log(result.line);
    if (result.failure) console.error(result.failure);
  }
  return results.some((result) => result.failure) ? 1 : 0;
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
