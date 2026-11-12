import { parseTimedText } from './cues.mjs';
import { urlOf, YOUTUBE_HOST } from './video-url.mjs';

export const WATCH_URL = 'https://www.youtube.com/watch?v=';
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

async function request(fetchFn, url, init, options) {
  const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(options.fetchMs) }).catch(unanswered(url));
  if (response.status === 429) throw new Unreadable('YouTube answered 429, this network is rate limited', { retryable: true, blocked: true, rateLimited: true });
  if (!response.ok) throw new Unreadable(`YouTube answered HTTP ${response.status}`, { retryable: true });
  return response.text().catch(unanswered(url));
}

export async function fetchPlayer(id, fetchFn, options, identity = IDENTITIES[0]) {
  const body = JSON.stringify({ context: { client: identity.client }, videoId: id });
  const headers = { 'content-type': 'application/json', 'user-agent': identity.agent };
  const text = await request(fetchFn, PLAYER_URL, { method: 'POST', headers, body }, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Unreadable('YouTube sent no player data', { retryable: true });
  }
}

async function playableWith(id, fetchFn, options, identity) {
  const player = await fetchPlayer(id, fetchFn, options, identity);
  checkPlayable(player);
  return player;
}

export async function fetchPlayable(id, fetchFn, options) {
  try {
    return await playableWith(id, fetchFn, options, IDENTITIES[0]);
  } catch (error) {
    if (!error.blocked) throw error;
    return playableWith(id, fetchFn, options, IDENTITIES[1]);
  }
}

export async function fetchWatchPage(id, fetchFn, options) {
  return request(fetchFn, `${WATCH_URL}${id}`, { headers: { 'accept-language': 'en-US,en;q=0.9' } }, options).catch(() => '');
}

export function checkPlayable(player) {
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

export function pickTrack(tracks, lang, defaultCode = null) {
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
  const xml = await request(fetchFn, track.url, {}, options);
  if (xml.trim() === '') throw new Unreadable('YouTube sent an empty caption file', { retryable: true });
  const cues = parseTimedText(xml, { auto: track.auto });
  if (cues.length === 0) throw new Unreadable('YouTube sent a caption file with no text', { retryable: true });
  return { xml, cues };
}
