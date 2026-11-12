import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { searchVideos } from '../skills/watch/scripts/search.mjs';

const script = path.resolve('skills/watch/scripts/search.mjs');

const RENDERER = {
  videoRenderer: {
    videoId: 'abcdefghijk',
    title: { runs: [{ text: 'Skills tour' }] },
    ownerText: { runs: [{ text: 'Exo Channel' }] },
    lengthText: { simpleText: '1:05' },
  },
};

function answer(renderers) {
  return {
    contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: renderers } }] } } } },
  };
}

function reply(status, body) {
  return async (url, init) => {
    reply.calls.push({ url, init });
    return { ok: status === 200, status, json: async () => body };
  };
}
reply.calls = [];

const OPTIONS = { query: 'skills', limit: 10, newest: false, fetchMs: 1000 };

test('lists id, url, title, channel and duration from an InnerTube answer', async () => {
  const result = await searchVideos(OPTIONS, reply(200, answer([{ adSlotRenderer: {} }, RENDERER])));
  assert.deepEqual(result.lines, ['abcdefghijk | https://www.youtube.com/watch?v=abcdefghijk | Skills tour | Exo Channel | 0:01:05']);
});

test('posts the query keylessly and sorts by upload date with newest', async () => {
  reply.calls.length = 0;
  await searchVideos({ ...OPTIONS, newest: true }, reply(200, answer([RENDERER])));
  const [{ url, init }] = reply.calls;
  assert.match(url, /youtubei\/v1\/search/);
  assert.doesNotMatch(url, /key=/);
  assert.equal(init.method, 'POST');
  const body = JSON.parse(init.body);
  assert.equal(body.query, 'skills');
  assert.equal(body.params, 'CAI=');
});

test('stops at the limit', async () => {
  const many = Array.from({ length: 5 }, () => RENDERER);
  const result = await searchVideos({ ...OPTIONS, limit: 2 }, reply(200, answer(many)));
  assert.equal(result.lines.length, 2);
});

test('reports no videos and a 429 as failures', async () => {
  const empty = await searchVideos(OPTIONS, reply(200, answer([])));
  assert.match(empty.failure, /no videos/);
  const limited = await searchVideos(OPTIONS, reply(429, {}));
  assert.match(limited.failure, /429/);
  assert.equal(limited.rateLimited, true);
  assert.equal((await searchVideos(OPTIONS, reply(403, {}))).rateLimited, false);
});

test('a missing query is a usage error', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

test('adds views and upload date when the renderer carries them and omits them otherwise', async () => {
  const counted = { videoRenderer: { ...RENDERER.videoRenderer, viewCountText: { simpleText: '1,234 views' }, publishedTimeText: { simpleText: '2 days ago' } } };
  const result = await searchVideos(OPTIONS, reply(200, answer([counted, RENDERER])));
  assert.deepEqual(result.lines, [
    'abcdefghijk | https://www.youtube.com/watch?v=abcdefghijk | Skills tour | Exo Channel | 0:01:05 | 1,234 views | 2 days ago',
    'abcdefghijk | https://www.youtube.com/watch?v=abcdefghijk | Skills tour | Exo Channel | 0:01:05',
  ]);
});

test('a non-JSON answer and a network error are failure lines, not throws', async () => {
  const html = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  const down = async () => { throw new TypeError('fetch failed'); };
  assert.match((await searchVideos(OPTIONS, html)).failure, /^search failed: .*not JSON/);
  assert.match((await searchVideos(OPTIONS, down)).failure, /^search failed: .*fetch failed/);
});

test('the search POST is paced through the request gate', async () => {
  await searchVideos(OPTIONS, reply(200, answer([RENDERER])));
  assert.ok(fs.readdirSync(process.env.CLAUDE_PLUGIN_DATA, { recursive: true }).some((name) => name.endsWith('youtube.com.last')));
});

test('search with an empty PATH spawns nothing', async () => {
  const saved = process.env.PATH;
  process.env.PATH = '';
  try {
    const result = await searchVideos(OPTIONS, reply(200, answer([RENDERER])));
    assert.equal(result.lines.length, 1);
  } finally {
    process.env.PATH = saved;
  }
});
