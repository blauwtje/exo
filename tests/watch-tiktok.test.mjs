import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { readTikTok, isTikTokUrl } from '../skills/watch/scripts/tiktok.mjs';
import { watchOne } from '../skills/watch/scripts/watch.mjs';
import { tempDir } from './harness.mjs';

const VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello there\n\n00:00:02.000 --> 00:00:04.000\nSecond line\n';
const VIDEO_URL = 'https://www.tiktok.com/@jane/video/7300000000000000000';
const OPTIONS = { fetchMs: 1000 };

function pageWith(subtitleInfos) {
  const itemStruct = { id: '7300000000000000000', desc: 'A clip', author: { uniqueId: 'jane' }, video: { duration: 4, subtitleInfos } };
  const state = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct } } } };
  return `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(state)}</script></html>`;
}

function fetchStub(routes) {
  return async (url) => {
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!route) return { ok: false, status: 404, text: async () => '' };
    const [, body] = route;
    return { ok: true, status: 200, text: async () => body };
  };
}

test('recognises TikTok hosts only', () => {
  assert.equal(isTikTokUrl(VIDEO_URL), true);
  assert.equal(isTikTokUrl('https://vm.tiktok.com/abc/'), true);
  assert.equal(isTikTokUrl('https://nottiktok.com/x'), false);
});

test('reads cues from the embedded rehydration JSON', async () => {
  const subtitle = [{ LanguageCodeName: 'eng-US', Format: 'webvtt', Url: 'https://v16.tiktokcdn.com/sub.vtt' }];
  const fetchFn = fetchStub({ [VIDEO_URL]: pageWith(subtitle), 'https://v16.tiktokcdn.com/sub.vtt': VTT });
  const read = await readTikTok(VIDEO_URL, OPTIONS, fetchFn);
  assert.deepEqual(read.cues.map((cue) => cue.text), ['Hello there', 'Second line']);
  assert.equal(read.title, 'A clip');
  assert.equal(read.author, 'jane');
  assert.equal(read.duration, 4);
});

test('no captions is a gap, with metadata and no speech-to-text', async () => {
  const read = await readTikTok(VIDEO_URL, OPTIONS, fetchStub({ [VIDEO_URL]: pageWith([]) }));
  assert.match(read.gap, /no captions/);
  assert.equal(read.title, 'A clip');
});

test('falls back to oEmbed metadata when the page has no rehydration JSON', async () => {
  const oembed = JSON.stringify({ title: 'From oembed', author_name: 'jane' });
  const fetchFn = fetchStub({ [VIDEO_URL]: '<html></html>', 'https://www.tiktok.com/oembed': oembed });
  const read = await readTikTok(VIDEO_URL, OPTIONS, fetchFn);
  assert.match(read.gap, /no captions/);
  assert.equal(read.title, 'From oembed');
});

test('a blocked page and blocked oEmbed is a gap', async () => {
  const read = await readTikTok(VIDEO_URL, OPTIONS, fetchStub({}));
  assert.match(read.gap, /TikTok/);
});

function routeOptions() {
  const dir = fs.realpathSync(tempDir('watch-tiktok-'));
  return { out: path.join(dir, 'out'), chunkMinutes: 30, stampSeconds: 45, fetchMs: 1000 };
}

test('the watch entry point reads a TikTok link with the TikTok reader and writes a transcript', async () => {
  const subtitle = [{ LanguageCodeName: 'eng-US', Format: 'webvtt', Url: 'https://v16.tiktokcdn.com/sub.vtt' }];
  const fetchFn = fetchStub({ [VIDEO_URL]: pageWith(subtitle), 'https://v16.tiktokcdn.com/sub.vtt': VTT });
  const options = routeOptions();
  const result = await watchOne(VIDEO_URL, options, fetchFn);
  assert.equal(result.failure, undefined);
  assert.match(result.line, /id=tiktok-7300000000000000000 title="A clip" duration=0:00:04 captions=tiktok:eng/);
  assert.match(fs.readFileSync(result.transcript, 'utf8'), /Hello there/);
});

test('a TikTok page the reader cannot read goes to yt-dlp when it is on PATH', async () => {
  const dir = fs.realpathSync(tempDir('watch-tiktok-ytdlp-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), '#!/bin/sh\necho "fake yt-dlp ran" >&2\nexit 3\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = bin;
  try {
    const result = await watchOne(VIDEO_URL, routeOptions(), fetchStub({}));
    assert.match(result.failure, /yt-dlp/);
  } finally {
    process.env.PATH = saved;
  }
});

async function withPath(value, run) {
  const saved = process.env.PATH;
  process.env.PATH = value;
  try {
    return await run();
  } finally {
    process.env.PATH = saved;
  }
}

test('a readable TikTok page with no captions goes to yt-dlp for speech when it is on PATH', async () => {
  const bin = path.join(fs.realpathSync(tempDir('watch-tiktok-speech-')), 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), '#!/bin/sh\necho "fake yt-dlp ran" >&2\nexit 3\n', { mode: 0o755 });
  const result = await withPath(bin, () => watchOne(VIDEO_URL, routeOptions(), fetchStub({ [VIDEO_URL]: pageWith([]) })));
  assert.match(result.failure, /fake yt-dlp ran/);
});

test('without yt-dlp the speech and keyframes request is a gap naming what was not done and downloads nothing', async () => {
  const result = await withPath('', () => watchOne(VIDEO_URL, routeOptions(), fetchStub({ [VIDEO_URL]: pageWith([]) })));
  assert.match(result.failure, /speech-to-text and keyframes were not done: yt-dlp is not on PATH/);
});
