import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSources } from '../skills/spec/scripts/ledger.mjs';
import { searchSource } from '../skills/spec/scripts/search.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';
import { createBucket } from '../skills/spec/scripts/sources/reddit-bucket.mjs';
import { parseComments, parseSearch } from '../skills/spec/scripts/sources/reddit-text.mjs';

const FIXTURES = new URL('./fixtures/research/', import.meta.url);

function fixture(name) {
  return fs.readFileSync(new URL(name, FIXTURES), 'utf8');
}

function answering(body, calls = []) {
  return {
    gate: { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'research-gate-')), capacity: 100, refillMs: 1 },
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response(body, { status: 200 });
    },
  };
}

function runFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'research-search-'));
}

test('hn hits become ledger rows with native signals', async () => {
  const runDir = runFolder();
  const rows = await searchSource({ source: 'hn', query: 'deep research', limit: 2, runDir }, answering(fixture('hn.json')));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].signals, { points: 120, comments: 45 });
  assert.equal(rows[0].url, 'https://news.ycombinator.com/item?id=101');
  assert.equal(readSources(runDir).length, 2);
});

test('arxiv feed is parsed into a canonical abstract url', async () => {
  const [row] = await searchSource({ source: 'arxiv', query: 'agents', limit: 1, runDir: runFolder() }, answering(fixture('arxiv.xml')));
  assert.equal(row.url, 'https://arxiv.org/abs/2401.00001');
  assert.equal(row.title, 'A survey of agents');
  assert.equal(row.date, '2024-01-02');
});

test('reddit html answer is a blocked route', async () => {
  const request = { source: 'reddit', query: 'x', limit: 1, runDir: runFolder() };
  await assert.rejects(searchSource(request, answering(fixture('reddit-blocked.html'))), BlockedRoute);
});

const SEARCH_ATOM = `<feed><entry><title>First &amp; post</title><content type="html">&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Body &amp;amp; more&lt;/p&gt;&lt;/div&gt;</content><link href="https://www.reddit.com/r/sub_one/comments/abc123/first_post/"/><updated>2025-02-03T10:00:00+00:00</updated></entry><entry><title>Second</title><content type="html">&lt;p&gt;Two&lt;/p&gt;</content><link href="https://www.reddit.com/r/sub_one/comments/def456/second/"/><updated>2025-02-04T10:00:00+00:00</updated></entry></feed>`;

const COMMENTS_HTML = `<shreddit-comment author="alice_example" depth="0" score="12" permalink="/r/sub_one/comments/abc123/comment/c1/"><div slot="comment"><div><p>Top &amp; level</p></div></div><div data-hl="x"></div></shreddit-comment><shreddit-comment author="bob_example" depth="1" score="-2" permalink="/r/sub_one/comments/abc123/comment/c2/"><div slot="comment"><p>Reply<br>two lines</p></div><faceplate-loader></faceplate-loader></shreddit-comment><shreddit-comment author="gone" depth="0" score="1"></shreddit-comment>`;

function redditContext({ plan = [], calls = [], env = {}, defaults = { threads: 5, concurrency: 3, capacity: 100, refillMs: 1 } }) {
  const clock = { time: 0 };
  const flight = { now: 0, max: 0 };
  return {
    env,
    defaults,
    flight,
    now: () => clock.time,
    sleep: async (ms) => {
      const wake = clock.time + ms;
      await new Promise((resolve) => setImmediate(resolve));
      clock.time = Math.max(clock.time, wake);
    },
    fetchImpl: async (url, init) => {
      const step = plan[calls.length] ?? {};
      calls.push({ url, init, at: clock.time });
      flight.now += 1;
      flight.max = Math.max(flight.max, flight.now);
      await new Promise((resolve) => setImmediate(resolve));
      flight.now -= 1;
      const fallback = url.includes('.rss') ? SEARCH_ATOM : COMMENTS_HTML;
      return new Response(step.body ?? fallback, { status: step.status ?? 200, headers: step.headers ?? {} });
    },
  };
}

const redditRequest = (extra = {}) => ({ source: 'reddit', query: 'r/sub_one caching', limit: 2, runDir: runFolder(), ...extra });
const oneThread = { threads: 1, concurrency: 1, capacity: 100, refillMs: 1 };

test('atom search entries become hits with title, date and decoded text', () => {
  const [first, second] = parseSearch(SEARCH_ATOM);
  assert.equal(first.title, 'First & post');
  assert.equal(first.url, 'https://www.reddit.com/r/sub_one/comments/abc123/first_post/');
  assert.equal(first.date, '2025-02-03');
  assert.equal(first.text, 'Body & more');
  assert.equal(second.text, 'Two');
});

test('shreddit comments become author, score, depth and plain text', () => {
  assert.deepEqual(parseComments(COMMENTS_HTML), [
    { author: 'alice_example', score: 12, depth: 0, text: 'Top & level' },
    { author: 'bob_example', score: -2, depth: 1, text: 'Reply\ntwo lines' },
  ]);
});

test('reddit search reads one subreddit feed and strips r/sub from the query', async () => {
  const calls = [];
  const rows = await searchSource(redditRequest(), redditContext({ calls }));
  assert.match(calls[0].url, /^https:\/\/www\.reddit\.com\/r\/sub_one\/search\.rss\?q=caching&restrict_sr=1&limit=2/);
  assert.equal(calls.filter((call) => call.url.includes('search.rss')).length, 1);
  assert.match(calls[1].url, /^https:\/\/www\.reddit\.com\/svc\/shreddit\/comments\/r\/sub_one\/t3_(abc123|def456)$/);
  assert.equal(rows[0].title, 'First & post');
  assert.equal(rows[0].description, 'Body & more');
  assert.match(rows[0].comments, /alice_example \(score 12, depth 0\): Top & level/);
});

test('reddit search without a subreddit goes site-wide and the flag scopes it', async () => {
  const calls = [];
  await searchSource(redditRequest({ query: 'caching' }), redditContext({ calls }));
  assert.match(calls[0].url, /^https:\/\/www\.reddit\.com\/search\.rss\?q=caching&limit=2/);
  const scoped = [];
  await searchSource(redditRequest({ query: 'caching', subreddit: 'other' }), redditContext({ calls: scoped }));
  assert.match(scoped[0].url, /^https:\/\/www\.reddit\.com\/r\/other\/search\.rss\?q=caching&restrict_sr=1/);
});

test('thread urls skip the search call', async () => {
  const calls = [];
  const urls = ['https://www.reddit.com/r/sub_one/comments/abc123/first_post/'];
  const [row] = await searchSource(redditRequest({ urls }), redditContext({ calls }));
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/www\.reddit\.com\/comments\/abc123\.rss\?limit=1$/);
  assert.match(calls[1].url, /svc\/shreddit\/comments\/r\/sub_one\/t3_abc123$/);
  assert.equal(row.title, 'First & post');
  assert.equal(row.description, 'Body & more');
  assert.match(row.comments, /bob_example/);
});

test('a refused post feed keeps the slug title and still reads comments', async () => {
  const urls = ['https://www.reddit.com/r/sub_one/comments/abc123/first_post/'];
  const [row] = await searchSource(redditRequest({ urls }), redditContext({ plan: [{ status: 429, headers: { 'x-ratelimit-reset': '55' } }] }));
  assert.equal(row.title, 'first post');
  assert.match(row.comments, /alice_example/);
});

test('thread fetches never exceed the concurrency default', async () => {
  const urls = Array.from({ length: 6 }, (_, index) => `https://www.reddit.com/r/sub_one/comments/id${index}/slug/`);
  const context = redditContext({ defaults: { threads: 6, concurrency: 2, capacity: 100, refillMs: 1 } });
  const rows = await searchSource(redditRequest({ urls }), context);
  assert.equal(rows.length, 6);
  assert.equal(context.flight.max, 2);
});

test('only the top threads default are fetched', async () => {
  const calls = [];
  const rows = await searchSource(redditRequest(), redditContext({ calls, defaults: oneThread }));
  assert.equal(calls.length, 2);
  assert.equal(rows[1].comments, undefined);
});

test('thread fetches wait for the token bucket after a burst', async () => {
  const calls = [];
  const urls = ['a1', 'b2', 'c3'].map((id) => `https://www.reddit.com/r/sub_one/comments/${id}/slug/`);
  await searchSource(redditRequest({ urls }), redditContext({ calls, defaults: { threads: 3, concurrency: 3, capacity: 2, refillMs: 500 } }));
  assert.deepEqual(calls.map((call) => call.at), [0, 0, 500, 1000]);
});

test('a burst above bucket capacity waits for refill', async () => {
  const clock = { time: 0 };
  const sleep = async (ms) => {
    clock.time += ms;
  };
  const bucket = createBucket({ capacity: 2, refillMs: 1000, now: () => clock.time, sleep });
  const times = [];
  for (let index = 0; index < 4; index += 1) {
    await bucket.take();
    times.push(clock.time);
  }
  assert.deepEqual(times, [0, 0, 1000, 2000]);
});

test('a 429 waits for x-ratelimit-reset and retries once', async () => {
  const calls = [];
  const plan = [{}, { status: 429, headers: { 'x-ratelimit-reset': '7' } }];
  const [row] = await searchSource(redditRequest(), redditContext({ plan, calls, defaults: oneThread }));
  assert.equal(calls.length, 3);
  assert.ok(calls[2].at - calls[1].at >= 7000);
  assert.match(row.comments, /alice_example/);
  assert.equal(row.blocked, undefined);
});

test('a 429 past the wait cap returns what it has with a blocked note', async () => {
  const plan = [{}, { status: 429, headers: { 'x-ratelimit-reset': '90' } }];
  const context = redditContext({ plan, env: { EXO_REDDIT_WAIT_MS: '5000' }, defaults: oneThread });
  const [row] = await searchSource(redditRequest(), context);
  assert.equal(row.title, 'First & post');
  assert.match(row.blocked, /EXO_REDDIT_WAIT_MS/);
});

test('a 403 on a thread returns the hits with a blocked note naming the web search fallback', async () => {
  const plan = [{}, { status: 403 }];
  const rows = await searchSource(redditRequest(), redditContext({ plan, defaults: oneThread }));
  assert.equal(rows.length, 2);
  assert.match(rows[0].blocked, /HTTP 403.*site:reddit\.com/);
});

test('a failing search feed is blocked and asks for thread urls', async () => {
  const request = redditRequest();
  await assert.rejects(searchSource(request, redditContext({ plan: [{ status: 500 }] })), /HTTP 500.*thread urls.*site:reddit\.com/);
  await assert.rejects(searchSource(request, redditContext({ plan: [{ body: 'nope' }] })), /not an Atom feed.*thread urls/);
});

test('github without a logged-in gh falls back to the REST search', async () => {
  const body = JSON.stringify({ items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', updated_at: '2025-01-01T00:00:00Z', stargazers_count: 7, description: 'does b' }] });
  const calls = [];
  const exec = async () => {
    throw new Error('not logged in');
  };
  const context = { ...answering(body, calls), exec };
  const runDir = runFolder();
  const [row] = await searchSource({ source: 'github', query: 'x', limit: 1, runDir }, context);
  assert.equal(row.title, 'a/b');
  assert.equal(row.description, 'does b');
  assert.equal(readSources(runDir).at(-1).description, 'does b');
  assert.match(calls[0], /api\.github\.com/);
});

test('unknown source is refused', async () => {
  await assert.rejects(searchSource({ source: 'nope', query: 'x', runDir: runFolder() }, {}), /unknown source/);
});

test('an answer without its result list is a blocked route', async () => {
  for (const source of ['wikipedia', 'hn', 'podcast', 'stackoverflow']) {
    const request = { source, query: 'x', limit: 1, runDir: runFolder() };
    await assert.rejects(searchSource(request, answering('{"error":{}}')), BlockedRoute, source);
  }
});
