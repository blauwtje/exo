import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseLine } from '#basics';
import { parseVtt, parseTimedText } from './cues.mjs';
import { extractFrames } from './decoder.mjs';
import { writeOutputs, headOf } from './outputs.mjs';
import { isRateLimited } from './request-gate.mjs';
import { ToolFailure } from './run-tool.mjs';
import { transcribe } from './speech.mjs';
import { readTikTok, isTikTokUrl, tiktokIdOf } from './tiktok.mjs';
import { WATCH_URL, sourceOf, urlOf, YOUTUBE_HOST } from './video-url.mjs';
import { runYtDlpWithRuntime, ytDlpReason, ytDlpAvailable, ytDlpNeed } from './ytdlp.mjs';

function languageFailure(id, lang, available) {
  return { failure: `${id}: no captions in language '${lang}'; available: ${available.join(', ')}. Rerun with --lang <code> set to one of them.` };
}

function noTranscript(id, reason) {
  return { failure: `${id}: no transcript: ${reason}` };
}

function missingTool(id, reason) {
  return { failure: `${id}: missing tool: ${reason}` };
}

function routed(result, route) {
  return result.transcript ? { ...result, route } : result;
}

async function watchBySpeech({ label, url, dir, head, details, why }, options) {
  const speech = await transcribe(url, dir, { ...options, runYtDlp: runYtDlpWithRuntime, ytDlpReason, ytDlpNeed });
  const lead = why ? `${why}; ` : '';
  if (speech.missing) return missingTool(label, `${lead}the video has no captions, and transcribing its audio needs ${speech.missing}, then rerun`);
  if (speech.failure) return noTranscript(label, `${lead}the video has no captions, and ${speech.failure}`);
  const cues = parseVtt(fs.readFileSync(speech.vtt, 'utf8'));
  const duration = details.duration > 0 ? details.duration : Math.ceil(cues.at(-1)?.start ?? 0);
  const chapters = details.chapters(duration);
  return routed(writeOutputs({ dir, cues, duration, chapters, head, captions: `speech:${speech.engine}` }, options), 'speech');
}

async function watchDirect(id, options, fetchFn) {
  const [player, page] = await Promise.all([fetchPlayable(id, fetchFn, options), fetchWatchPage(id, fetchFn, options)]);
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
  return routed(writeOutputs({ dir, cues, duration, chapters: chaptersFromHtml(page, duration), head, captions }, options), 'page-captions');
}

function ytDlpFailure(why, reason) {
  return why ? `${why}; yt-dlp failed too: ${reason}` : `yt-dlp failed: ${reason}`;
}

async function watchWithYtDlp({ id, url }, options, why) {
  const label = id ?? url;
  const meta = await runYtDlpWithRuntime(['-J', '--write-subs', '--write-auto-subs', '--no-playlist', '--no-warnings', '--', url], options.ytDlpMs);
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
  if (!vttName && isRateLimited(download)) {
    const details = { duration: info.duration, chapters: () => chaptersOf(info) };
    return watchBySpeech({ label: folder, url, dir, head: headOf(folder, info.title), details, why: 'captions are rate-limited' }, options);
  }
  if (!vttName) return noTranscript(folder, `${why ? `${why}; ` : ''}yt-dlp wrote no ${picked.key} captions: ${ytDlpReason(download, options)}`);
  const raw = path.join(dir, 'raw.vtt');
  fs.renameSync(path.join(dir, vttName), raw);
  const cues = parseVtt(fs.readFileSync(raw, 'utf8'), { auto: picked.source === 'auto' });
  const duration = info.duration ?? Math.ceil(cues.at(-1)?.start ?? 0);
  return routed(writeOutputs({ dir, cues, duration, chapters: chaptersOf(info), head: headOf(folder, info.title), captions: `${picked.source}:${picked.key}` }, options), 'ytdlp-captions');
}

async function watchTikTok({ url }, options, fetchFn) {
  const id = tiktokIdOf(url);
  const read = await readTikTok(url, options, fetchFn);
  if (read.gap && (await ytDlpAvailable(options.ytDlpMs))) return watchWithYtDlp({ url }, options);
  if (read.silent) return noTranscript(id, `${read.gap}; speech-to-text and keyframes were not done: yt-dlp is not on PATH`);
  if (read.gap) return noTranscript(id, read.gap);
  const duration = read.duration > 0 ? read.duration : Math.ceil(read.cues.at(-1)?.start ?? 0);
  const dir = path.join(options.out, id);
  fs.mkdirSync(dir, { recursive: true });
  return routed(writeOutputs({ dir, cues: read.cues, duration, chapters: [], head: headOf(id, read.title), captions: read.captions }, options), 'page-captions');
}

async function watchSite({ url, host }, options) {
  const need = await ytDlpNeed();
  if (need) return missingTool(url, `reading ${host} videos needs ${need}, then rerun`);
  return watchWithYtDlp({ url }, options);
}

async function watchSource(source, options, fetchFn) {
  if (source.url && isTikTokUrl(source.url)) return watchTikTok(source, options, fetchFn);
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

async function watchOne(input, options, fetchFn) {
  const source = sourceOf(input);
  if (!source) return { failure: `${input}: not a video url or an 11-character YouTube id` };
  const readStart = Date.now();
  const result = await watchSource(source, options, fetchFn);
  const keyframesStart = Date.now();
  const framed = await withKeyframes(result, source.id ? `${WATCH_URL}${source.id}` : source.url, options);
  if (!framed.transcript) return framed;
  return { ...framed, timings: { read: keyframesStart - readStart, keyframes: Date.now() - keyframesStart } };
}

export function watchGuarded(input, options, fetchFn) {
  return Promise.resolve().then(() => watchOne(input, options, fetchFn)).catch((error) => ({ failure: `${input}: ${error.message}` }));
}

const FEW_WORDS = 15;
const SOURCE_FOLDER = 'video-source';

async function downloadVideo(url, folder, options) {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const runYtDlp = options.runYtDlp ?? runYtDlpWithRuntime;
  const args = ['-f', 'bv*/b', '-S', 'res:480', '--no-playlist', '--playlist-items', '1', '--no-warnings', '-P', folder, '-o', 'video.%(ext)s', '--', url];
  const run = await runYtDlp(args, options.ytDlpMs);
  const name = fs.readdirSync(folder).find((file) => file.startsWith('video.'));
  if (name && !run.error) return path.join(folder, name);
  throw new ToolFailure(`video download failed: ${ytDlpReason(run, options)}`);
}

async function grabFrames({ url, dir, duration }, options) {
  const folder = path.join(dir, SOURCE_FOLDER);
  try {
    const video = await downloadVideo(url, folder, options);
    return await extractFrames(video, dir, duration, options);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function isQuiet(result, options) {
  if (!result.transcript || !(result.duration > 0)) return false;
  const inBatch = options.urls?.length > 1;
  return result.words < (inBatch ? 1 : FEW_WORDS);
}

export async function withKeyframes(result, url, options) {
  const quiet = isQuiet(result, options);
  if (!quiet) return result;
  try {
    const frames = await grabFrames({ url, dir: result.dir, duration: result.duration }, options);
    return { ...result, line: `${result.line} frames=${frames} (${fs.readdirSync(frames).length} files)` };
  } catch (error) {
    if (error instanceof ToolFailure) return result;
    throw error;
  }
}

const INITIAL_DATA = 'var ytInitialData = ';

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
  return parseLine(html.slice(start, html.indexOf(';</script>', start)));
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
  const base = language?.split('-')[0];
  return trackKey(tracks, language, preferOriginal)
    ?? (base && base !== language ? trackKey(tracks, base, preferOriginal) : null)
    ?? trackKey(tracks, null);
}

function originalAudioLanguage(info) {
  const original = (info.formats ?? []).find((format) => format.language && /\boriginal\b/i.test(format.format_note ?? ''));
  return original?.language ?? null;
}

export function pickCaptions(info, lang) {
  const wanted = lang ?? originalAudioLanguage(info) ?? info.language ?? null;
  const manual = lang ? trackKey(info.subtitles, lang) : chooseTrack(info.subtitles, wanted);
  if (manual) return { source: 'manual', key: manual };
  const auto = lang ? trackKey(info.automatic_captions, lang, true) : chooseTrack(info.automatic_captions, wanted, true);
  if (auto) return { source: 'auto', key: auto };
  return null;
}

export function chaptersOf(info) {
  return (info.chapters ?? []).map((chapter) => ({
    start: chapter.start_time,
    end: chapter.end_time,
    title: String(chapter.title ?? '').replace(/\s+/g, ' ').trim() || 'Chapter',
  }));
}

function idSuffix(id) {
  if (!/[A-Z]/.test(id)) return '';
  return `-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`;
}

export function folderOf(info) {
  const name = `${info.extractor_key.toLowerCase()}-${info.id}`.replace(/[^\w-]/g, '-');
  return `${name}${idSuffix(info.id)}`;
}

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const IDENTITIES = [
  { client: { clientName: 'ANDROID', clientVersion: '20.10.38' }, agent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
  { client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2' }, agent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)' },
];

export class Unreadable extends Error {
  constructor(message, { retryable = false, blocked = false, rateLimited = false } = {}) {
    super(message);
    this.retryable = retryable;
    this.blocked = blocked;
    this.rateLimited = rateLimited;
  }
}

function unanswered(url) {
  return (error) => {
    throw new Unreadable(`${url.split('?')[0]} did not answer: ${error.message}`, { retryable: true });
  };
}

async function request({ fetchFn, options }, url, init) {
  const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(options.fetchMs) }).catch(unanswered(url));
  if (response.status === 429) throw new Unreadable('YouTube answered 429, this network is rate limited', { retryable: true, blocked: true, rateLimited: true });
  if (!response.ok) throw new Unreadable(`YouTube answered HTTP ${response.status}`, { retryable: true });
  return response.text().catch(unanswered(url));
}

async function fetchPlayer(id, network, identity) {
  const body = JSON.stringify({ context: { client: identity.client }, videoId: id });
  const headers = { 'content-type': 'application/json', 'user-agent': identity.agent };
  const text = await request(network, PLAYER_URL, { method: 'POST', headers, body });
  try {
    return JSON.parse(text);
  } catch {
    throw new Unreadable(`YouTube sent no player data for video ${id}`, { retryable: true });
  }
}

async function playableWith(id, network, identity) {
  const player = await fetchPlayer(id, network, identity);
  checkPlayable(player);
  return player;
}

export async function fetchPlayable(id, fetchFn, options) {
  try {
    return await playableWith(id, { fetchFn, options }, IDENTITIES[0]);
  } catch (error) {
    if (!error.blocked) throw error;
    return playableWith(id, { fetchFn, options }, IDENTITIES[1]);
  }
}

function emptyWhenUnreadable(error) {
  if (!(error instanceof Unreadable)) throw error;
  return '';
}

export async function fetchWatchPage(id, fetchFn, options) {
  return request({ fetchFn, options }, `${WATCH_URL}${id}`, { headers: { 'accept-language': 'en-US,en;q=0.9' } }).catch(emptyWhenUnreadable);
}

function checkPlayable(player) {
  const { status, reason = '' } = player.playabilityStatus ?? {};
  if (status === 'OK') return;
  if (status === 'LOGIN_REQUIRED' && /bot/i.test(reason)) throw new Unreadable('YouTube asks this network to sign in and prove it is not a bot', { retryable: true, blocked: true });
  const cannotPlay = `the video cannot be played (${status ?? 'no status'}${reason ? `: ${reason}` : ''})`;
  throw new Unreadable(cannotPlay, { retryable: status === 'UNPLAYABLE' });
}

export function tracksOf(player) {
  const listed = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return listed
    .filter((track) => YOUTUBE_HOST.test(urlOf(track.baseUrl ?? '')?.hostname ?? ''))
    .map((track) => ({ code: track.languageCode, auto: track.kind === 'asr', url: track.baseUrl }));
}

export function defaultLanguage(player) {
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

export function pickTrack(tracks, lang, defaultCode) {
  const manual = tracks.filter((track) => !track.auto);
  const auto = tracks.filter((track) => track.auto);
  if (lang) return closest(manual, lang) ?? closest(auto, lang);
  return bestOf(manual, defaultCode) ?? bestOf(auto, defaultCode);
}

export function languagesOf(tracks) {
  return [...new Set(tracks.map((track) => track.code))];
}

export async function readCaptions(track, fetchFn, options) {
  if (/[?&]exp=xpe\b/.test(track.url)) throw new Unreadable('YouTube wants a proof-of-origin token for these captions', { retryable: true });
  const xml = await request({ fetchFn, options }, track.url, {});
  if (xml.trim() === '') throw new Unreadable('YouTube sent an empty caption file', { retryable: true });
  const cues = parseTimedText(xml, { auto: track.auto });
  if (cues.length === 0) throw new Unreadable('YouTube sent a caption file with no text', { retryable: true });
  return { xml, cues };
}
