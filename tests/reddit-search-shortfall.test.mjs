import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '../skills/spec/scripts/sources/reddit-bucket.mjs';
import { archiveHits, rssHits } from '../skills/spec/scripts/sources/reddit-discover.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

const SETTINGS = { concurrency: 3, capacity: 3, refillMs: 400, waitCapMs: 65_000 };
const ATOM = '<feed><entry><title>t</title><link href="https://www.reddit.com/r/a/comments/1/x/"/><updated>2026-01-01T00:00:00Z</updated><content>c</content></entry></feed>';
const NOW = 1_800_000_000_000;

function seededDir(resetMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-'));
  const hosts = { 'reddit.com/rss': { failures: 0, openUntil: 0, remaining: 0, resetAt: NOW + resetMs } };
  fs.writeFileSync(path.join(dir, 'host-state.json'), JSON.stringify({ hosts, blocked: [] }));
  return dir;
}

function rssClient(resetMs) {
  const slept = [];
  const fetchImpl = async () => new Response(ATOM, { status: 200 });
  const context = { fetchImpl, stateDir: seededDir(resetMs), now: () => NOW, sleep: async (ms) => slept.push(ms) };
  return { client: createClient(context, SETTINGS), slept };
}

test('rssHits waits for a reset under the cap', async () => {
  const { client, slept } = rssClient(50_000);
  const hits = await rssHits(client, { subreddit: 'a' }, { text: 'x', limit: 3 });
  assert.equal(hits.length, 1);
  assert.deepEqual(slept, [50_000]);
});

test('rssHits refuses a reset beyond the cap', async () => {
  const { client } = rssClient(120_000);
  await assert.rejects(rssHits(client, { subreddit: 'a' }, { text: 'x', limit: 3 }), BlockedRoute);
});

function archiveContext(seen) {
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    seen.push(params);
    if (params.has('after') && params.has('before')) return new Response(JSON.stringify({ data: [{ title: 'p', permalink: '/r/a/comments/1/x/', created_utc: 1_700_000_000, selftext: 's', score: 1, num_comments: 2 }] }), { status: 200 });
    return new Response(JSON.stringify({ data: null, error: 'Timeout. Maybe slow down a bit' }), { status: 422 });
  };
  return { fetchImpl, now: () => NOW, gate: {} };
}

for (const time of ['all', 'year']) {
  test(`archiveHits sends a bounded window for time ${time}`, async () => {
    const seen = [];
    const hits = await archiveHits({ subreddit: 'a', time }, { text: 'x', limit: 3, reason: 'r' }, archiveContext(seen));
    assert.equal(hits.length, 1);
  });
}

test('archiveHits blocked line carries the response reason', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ data: null, error: 'Timeout. Maybe slow down a bit' }), { status: 422 });
  await assert.rejects(
    archiveHits({ subreddit: 'a', time: 'year' }, { text: 'x', limit: 3, reason: 'r' }, { fetchImpl, now: () => NOW, gate: {} }),
    /HTTP 422: Timeout\. Maybe slow down a bit/,
  );
});
