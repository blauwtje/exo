import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSources } from '../skills/spec/scripts/ledger.mjs';
import { searchSource } from '../skills/spec/scripts/search.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';
import { createHostState } from '../skills/spec/scripts/sources/host-state.mjs';
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

const isThreadPage = (url) => /reddit\.com\/r\/\w+\/comments\//.test(url) && !url.includes('.rss');

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
      if (isThreadPage(url)) return new Response('<html>challenge</html>');
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

const redditRequest = (extra = {}) => ({ source: 'reddit', query: 'caching', limit: 2, runDir: runFolder(), ...extra });
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
  const rows = await searchSource(redditRequest({ query: 'r/sub_one caching' }), redditContext({ calls }));
  const feeds = calls.filter((call) => call.url.includes('search.rss'));
  assert.equal(feeds.length, 1);
  assert.match(feeds[0].url, /^https:\/\/www\.reddit\.com\/r\/sub_one\/search\.rss\?q=caching&restrict_sr=1&sort=new&t=all&limit=2/);
  assert.match(calls.at(-1).url, /^https:\/\/www\.reddit\.com\/svc\/shreddit\/comments\/r\/sub_one\/t3_(abc123|def456)$/);
  assert.equal(rows[0].title, 'First & post');
  assert.equal(rows[0].description, 'Body & more');
  assert.match(rows[0].comments, /alice_example \(score 12, depth 0\): Top & level/);
});

test('reddit search without a subreddit goes site-wide and the flag scopes it', async () => {
  const calls = [];
  await searchSource(redditRequest(), redditContext({ calls }));
  assert.match(calls[0].url, /^https:\/\/www\.reddit\.com\/search\.rss\?q=caching&sort=new&t=all&limit=2/);
  const scoped = [];
  await searchSource(redditRequest({ subreddit: 'other' }), redditContext({ calls: scoped }));
  assert.match(scoped.find((call) => call.url.includes('.rss')).url, /^https:\/\/www\.reddit\.com\/r\/other\/search\.rss\?q=caching&restrict_sr=1/);
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
  const [row] = await searchSource(redditRequest({ urls }), redditContext({ plan: [{ status: 429, headers: { 'x-ratelimit-reset': '90' } }] }));
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
  const rows = await searchSource(redditRequest({ limit: 1 }), redditContext({ calls, defaults: oneThread }));
  assert.equal(calls.length, 2);
  assert.equal(rows[1].comments, undefined);
});

test('thread fetches wait for the token bucket after a burst', async () => {
  const calls = [];
  const urls = ['a1', 'b2', 'c3'].map((id) => `https://www.reddit.com/r/sub_one/comments/${id}/slug/`);
  await searchSource(redditRequest({ urls, limit: 3 }), redditContext({ calls, defaults: { threads: 3, concurrency: 3, capacity: 2, refillMs: 500 } }));
  assert.deepEqual(calls.map((call) => call.at), [0, 0, 0, 500]);
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
  const [row] = await searchSource(redditRequest({ limit: 1 }), redditContext({ plan, calls, defaults: oneThread }));
  assert.equal(calls.length, 3);
  assert.ok(calls[2].at - calls[1].at >= 7000);
  assert.match(row.comments, /alice_example/);
  assert.equal(row.blocked, undefined);
});

const ARCHIVE_TREE = JSON.stringify({ data: [{ kind: 't1', data: { author: 'carol_example', score: 4, body: 'Archived top', replies: [{ kind: 't1', data: { author: 'dave_example', score: 1, body: 'Archived reply' } }] } }, { kind: 'more', data: { children: ['x1'], count: 1 } }, { kind: 't1', data: { author: 'erin_example', score: 2, body: 'Listing parent', replies: { kind: 'Listing', data: { children: [{ kind: 't1', data: { author: 'finn_example', score: 3, body: 'Listing child', replies: '' } }, { kind: 'more', data: { children: ['x2'] } }] } } } }] });
const TWO_THREADS = ['abc123', 'def456'].map((id) => `https://www.reddit.com/r/sub_one/comments/${id}/slug/`);
const twoThreadDefaults = { threads: 2, concurrency: 1, capacity: 100, refillMs: 1 };

function limitedFirstThread(env, answer = { status: 429, headers: { 'x-ratelimit-reset': '90' } }) {
  const base = redditContext({ env, defaults: twoThreadDefaults });
  const state = { limited: false };
  const fetchImpl = async (url, init) => {
    if (url.includes('arctic-shift')) return new Response(ARCHIVE_TREE);
    if (!url.includes('t3_abc123') || state.limited) return base.fetchImpl(url, init);
    state.limited = true;
    return new Response('', answer);
  };
  return { ...base, fetchImpl };
}

test('a 429 past the wait cap reads only that thread from the archive and names it', async () => {
  const context = limitedFirstThread({ EXO_REDDIT_WAIT_MS: '5000' });
  const rows = await searchSource(redditRequest({ urls: TWO_THREADS }), context);
  const archived = rows.find((row) => row.url.includes('abc123'));
  const live = rows.find((row) => row.url.includes('def456'));
  assert.match(archived.comments, /carol_example \(score 4, depth 0\): Archived top/);
  assert.match(archived.comments, /dave_example \(score 1, depth 1\)/);
  assert.match(archived.comments, /finn_example \(score 3, depth 1\): Listing child/);
  assert.match(archived.signals, /Arctic Shift archive; retrieved_on/);
  assert.equal(archived.blocked, undefined);
  assert.match(live.comments, /alice_example/);
  assert.equal(live.signals, 'live Reddit; score and comment count unavailable; 2 comments read');
});

test('a 503 on one thread reads only that thread from the archive', async () => {
  const context = limitedFirstThread({}, { status: 503 });
  const rows = await searchSource(redditRequest({ urls: TWO_THREADS }), context);
  const archived = rows.find((row) => row.url.includes('abc123'));
  const live = rows.find((row) => row.url.includes('def456'));
  assert.match(archived.signals, /Arctic Shift/);
  assert.equal(live.signals, 'live Reddit; score and comment count unavailable; 2 comments read');
  assert.equal(live.blocked, undefined);
});

test('a 429 with an unreadable archive keeps the hit with a blocked note', async () => {
  const plan = [{}, { status: 429, headers: { 'x-ratelimit-reset': '90' } }, { body: 'nope' }];
  const context = redditContext({ plan, env: { EXO_REDDIT_WAIT_MS: '5000' }, defaults: oneThread });
  const [row] = await searchSource(redditRequest(), context);
  assert.equal(row.title, 'First & post');
  assert.match(row.blocked, /EXO_REDDIT_WAIT_MS.*Arctic Shift.*not JSON/);
});

test('a 403 on a thread returns the hits with a blocked note naming the web search fallback', async () => {
  const plan = [{}, { status: 403 }];
  const rows = await searchSource(redditRequest(), redditContext({ plan, defaults: oneThread }));
  assert.equal(rows.length, 2);
  assert.match(rows[0].blocked, /HTTP 403.*search\.mjs --url/);
});

test('a failing search feed is blocked and asks for thread urls', async () => {
  const request = redditRequest();
  await assert.rejects(searchSource(request, redditContext({ plan: [{ status: 500 }] })), /HTTP 500.*thread urls.*search\.mjs --url/);
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

function exhaustedBudget(context) {
  const stateDir = runFolder();
  createHostState({ dir: stateDir, now: context.now }).recordBudget('reddit.com/rss', { remaining: 0, resetAt: 10_000 });
  return { ...context, stateDir };
}

test('reddit rss search is skipped when host state shows no budget', async () => {
  const calls = [];
  const context = exhaustedBudget(redditContext({ calls }));
  await assert.rejects(searchSource(redditRequest(), context), /no reddit budget.*search\.mjs --url/i);
  assert.equal(calls.filter((call) => call.url.startsWith('https://www.reddit.com')).length, 0);
});

test('thread urls skip the rss post feed when host state shows no budget', async () => {
  const calls = [];
  const urls = ['https://www.reddit.com/r/sub_one/comments/abc123/first_post/'];
  const context = exhaustedBudget(redditContext({ calls, defaults: oneThread }));
  const [row] = await searchSource(redditRequest({ urls }), context);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /svc\/shreddit\/comments\/r\/sub_one\/t3_abc123$/);
  assert.match(row.comments, /bob_example/);
});

test('searchMany runs sources together, prints a line per failure and logs one metric per call', async () => {
  const { searchMany } = await import('../skills/spec/scripts/search.mjs');
  const runDir = runFolder();
  const request = { query: 'agents', limit: 1, runDir };
  const context = answering(fixture('arxiv.xml'));
  const { lines, failed } = await searchMany({ ...request, sources: ['arxiv', 'nope'] }, context);
  assert.equal(failed, false);
  assert.equal(JSON.parse(lines[0]).title, 'A survey of agents');
  assert.match(lines[1], /^status: failed nope unknown source nope/);
  const metrics = fs.readFileSync(path.join(runDir, 'metrics.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(metrics.map((row) => [row.tool, row.source, row.ok]).sort(), [['search', 'arxiv', true], ['search', 'nope', false]]);
});

test('reddit failures in separate searches open the breaker through the run state file', async () => {
  const runDir = runFolder();
  const failing = { plan: Array.from({ length: 3 }, () => ({ status: 500 })) };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(searchSource(redditRequest({ runDir }), redditContext({ ...failing, calls: [] })), BlockedRoute);
  }
  const calls = [];
  await assert.rejects(searchSource(redditRequest({ runDir }), redditContext({ calls })), /no Reddit budget/);
  assert.equal(calls.length, 0);
});

test('a 429 on thread 2 of 3 returns all three threads and the other two keep comments', async () => {
  const urls = ['abc123', 'def456', 'ghi789'].map((id) => `https://www.reddit.com/r/sub_one/comments/${id}/slug/`);
  const base = redditContext({ env: { EXO_REDDIT_WAIT_MS: '5000' }, defaults: { threads: 3, concurrency: 1, capacity: 100, refillMs: 1 } });
  const fetchImpl = async (url, init) => {
    if (url.includes('arctic-shift')) return new Response('nope');
    if (url.includes('t3_def456')) return new Response('', { status: 429, headers: { 'x-ratelimit-reset': '90' } });
    return base.fetchImpl(url, init);
  };
  const rows = await searchSource(redditRequest({ urls, limit: 3 }), { ...base, fetchImpl });
  assert.equal(rows.length, 3);
  assert.match(rows[0].comments, /alice_example/);
  assert.ok(rows[1].blocked);
  assert.match(rows[2].comments, /alice_example/);
});

test('three back-to-back reddit searches in one run dir all return threads', async () => {
  const runDir = runFolder();
  const defaults = { threads: 2, concurrency: 1, capacity: 100, refillMs: 1 };
  for (let round = 0; round < 3; round += 1) {
    const rows = await searchSource(redditRequest({ runDir }), redditContext({ defaults }));
    assert.equal(rows.length, 2);
    assert.match(rows[0].comments, /alice_example/);
  }
});

test('reddit rate limit headers are recorded as the shared budget', async () => {
  const stateDir = runFolder();
  const plan = [{}, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '30' } }];
  const context = { ...redditContext({ plan, defaults: oneThread }), stateDir };
  await searchSource(redditRequest(), context);
  assert.equal(createHostState({ dir: stateDir, now: () => 0 }).budgetWaitMs('reddit.com/shreddit'), 30000);
});

test('an open breaker sends a thread read to the archive without a live call', async () => {
  const stateDir = runFolder();
  const hostState = createHostState({ dir: stateDir, now: () => 0 });
  for (let attempt = 0; attempt < 3; attempt += 1) hostState.recordStatus('reddit.com/shreddit', 500);
  const calls = [];
  const base = redditContext({ calls, defaults: oneThread });
  const fetchImpl = async (url, init) => (url.includes('arctic-shift') ? new Response(ARCHIVE_TREE) : base.fetchImpl(url, init));
  const urls = ['https://www.reddit.com/r/sub_one/comments/abc123/slug/'];
  const [row] = await searchSource(redditRequest({ urls }), { ...base, fetchImpl, stateDir });
  assert.equal(calls.filter((call) => call.url.includes('svc/shreddit')).length, 0);
  assert.match(row.comments, /carol_example/);
});

test('archive nodes of kind more and replies as a Listing or empty text do not crash', async () => {
  const { readArchiveComments } = await import('../skills/spec/scripts/sources/reddit-archive.mjs');
  const comments = await readArchiveComments('abc123', { fetchImpl: async () => new Response(ARCHIVE_TREE) });
  assert.deepEqual(comments.map((comment) => comment.author), ['carol_example', 'dave_example', 'erin_example', 'finn_example']);
});

test('the archive read records a 5xx in the shared host state', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createHostState } = await import('../skills/spec/scripts/sources/host-state.mjs');
  const { readArchiveComments } = await import('../skills/spec/scripts/sources/reddit-archive.mjs');
  const stateDir = mkdtempSync(join(tmpdir(), 'archive-state-'));
  const fetchImpl = async () => new Response('x', { status: 500 });
  for (let i = 0; i < 3; i++) await readArchiveComments('abc123', { fetchImpl, stateDir }).catch(() => {});
  assert.equal(createHostState({ dir: stateDir }).isOpen('arctic-shift.photon-reddit.com'), true);
});

test('a bucket wait over the cap reads that thread from the archive', async () => {
  const base = redditContext({ env: { EXO_REDDIT_WAIT_MS: '5000' }, defaults: { threads: 2, concurrency: 1, capacity: 1, refillMs: 40_000 } });
  const fetchImpl = async (url, init) => (url.includes('arctic-shift') ? new Response(ARCHIVE_TREE) : base.fetchImpl(url, init));
  const rows = await searchSource(redditRequest({ urls: TWO_THREADS }), { ...base, fetchImpl });
  const archived = rows.find((row) => row.url.includes('def456'));
  assert.match(archived.comments, /carol_example/);
  assert.match(archived.signals, /Arctic Shift/);
  assert.equal(archived.blocked, undefined);
});

test('reddit search passes the sort and time window to the feed', async () => {
  const calls = [];
  await searchSource(redditRequest({ sort: 'top', time: 'week' }), redditContext({ calls }));
  assert.match(calls[0].url, /sort=top&t=week/);
});

test('the search CLI forwards --sort and --time into the request', () => {
  const source = fs.readFileSync(new URL('../skills/spec/scripts/search.mjs', import.meta.url), 'utf8');
  assert.match(source, /sort: args\.sort/);
  assert.match(source, /time: args\.time/);
});
