import { parseLine } from '#basics';
import { parseVtt } from './cues.mjs';
import { isFetchFailure } from './run-tool.mjs';

const TIKTOK_HOST = /(^|\.)tiktok\.com$/;
const REHYDRATION = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;
const OEMBED_URL = 'https://www.tiktok.com/oembed?url=';
const AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function isTikTokUrl(text) {
  if (!URL.canParse(text)) return false;
  return TIKTOK_HOST.test(new URL(text).hostname);
}

function nullWhenUnanswered(error) {
  if (!isFetchFailure(error)) throw error;
  return null;
}

async function getText(fetchFn, url, options) {
  const init = { headers: { 'user-agent': AGENT, 'accept-language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(options.fetchMs) };
  const response = await fetchFn(url, init).catch(nullWhenUnanswered);
  if (!response?.ok) return null;
  return response.text().catch(nullWhenUnanswered);
}

function itemOf(page) {
  const embedded = REHYDRATION.exec(page ?? '')?.[1];
  if (!embedded) return null;
  return parseLine(embedded)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ?? null;
}

async function oembedOf(fetchFn, url, options) {
  const text = await getText(fetchFn, `${OEMBED_URL}${encodeURIComponent(url)}`, options);
  return parseLine(text);
}

function subtitleOf(item) {
  const listed = item.video?.subtitleInfos ?? [];
  const webvtt = listed.filter((info) => info.Format === 'webvtt' && info.Url);
  return webvtt.find((info) => info.LanguageCodeName?.startsWith('eng')) ?? webvtt[0] ?? null;
}

async function cuesOf(fetchFn, subtitle, options) {
  const vtt = await getText(fetchFn, subtitle.Url, options);
  return vtt ? parseVtt(vtt) : [];
}

const MACHINE_SOURCES = new Set(['ASR', 'MT']);

function captionsLabelOf(subtitle) {
  const language = (subtitle.LanguageCodeName ?? 'eng').split('-')[0];
  const origin = MACHINE_SOURCES.has(subtitle.Source) ? 'auto' : 'tiktok';
  return `${origin}:${language}`;
}

async function readPage(url, options, fetchFn) {
  const item = itemOf(await getText(fetchFn, url, options));
  if (!item) {
    const meta = await oembedOf(fetchFn, url, options);
    if (!meta) return { unread: true, gap: `TikTok answered neither the page nor oEmbed for ${url}; no transcript` };
    return { title: meta.title, author: meta.author_name, unread: true, gap: `no captions: TikTok sent no page data for ${url}` };
  }
  const base = { title: item.desc, author: item.author?.uniqueId, duration: item.video?.duration };
  const subtitle = subtitleOf(item);
  const cues = subtitle ? await cuesOf(fetchFn, subtitle, options) : [];
  if (cues.length === 0) return { ...base, silent: true, gap: `no captions: ${url} has no caption track` };
  return { ...base, cues, captions: captionsLabelOf(subtitle) };
}

export function prefetchTikTok(urls, { parallel, signal, ...options }, fetchFn) {
  const reads = new Map();
  const waiting = new Set();
  const lanes = Array.from({ length: parallel }, () => Promise.resolve());
  const startRead = (url) => {
    if (signal?.aborted) return null;
    waiting.delete(url);
    return readPage(url, options, fetchFn);
  };
  for (const [index, url] of urls.filter(isTikTokUrl).entries()) {
    const lane = index % parallel;
    lanes[lane] = lanes[lane].then(() => startRead(url));
    waiting.add(url);
    reads.set(url, lanes[lane]);
  }
  signal?.addEventListener('abort', () => waiting.forEach((url) => reads.delete(url)));
  return reads;
}

export function readTikTok(url, options, fetchFn) {
  const prefetched = options.pageReads?.get(url);
  if (!prefetched) return readPage(url, options, fetchFn);
  options.pageReads.delete(url);
  return prefetched;
}

export function tiktokIdOf(url) {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const raw = segments.at(-1) ?? 'video';
  return `tiktok-${raw.replace(/[^\w-]/g, '')}`;
}
