import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const archiveSource = readFileSync(new URL('../skills/spec/scripts/sources/reddit-archive.mjs', import.meta.url), 'utf8');
const redditSource = readFileSync(new URL('../skills/spec/scripts/sources/reddit.mjs', import.meta.url), 'utf8');

test('the Reddit rate wait default covers the observed 46 s reset', () => {
  const cap = Number(/WAIT_CAP_MS = ([\d_]+)/.exec(redditSource)[1].replaceAll('_', ''));
  assert.ok(cap >= 46_000);
});

test('an archive row carries its capture date and the live failure reason', () => {
  assert.match(archiveSource, /retrieved_on/);
  assert.match(archiveSource, /live failure|liveFailure/);
});

test('an archive comment carries its retrieved_on date', async () => {
  const { readArchiveComments } = await import('../skills/spec/scripts/sources/reddit-archive.mjs');
  const tree = { data: [{ kind: 't1', data: { author: 'a_example', score: 1, body: 'x', retrieved_on: 1_761_771_767 } }] };
  const [comment] = await readArchiveComments('abc123', { fetchImpl: async () => new Response(JSON.stringify(tree)) });
  assert.equal(comment.retrievedOn, '2025-10-29');
});

test('shreddit more-comments partials are followed for deeper replies', async () => {
  const { parseMoreLinks } = await import('../skills/spec/scripts/sources/reddit-text.mjs');
  const html = '<faceplate-partial loading="action" src="/svc/shreddit/more-comments/sub/t3_abc?startingDepth=3&amp;sort=CONFIDENCE" method="post">';
  assert.deepEqual(parseMoreLinks(html), ['/svc/shreddit/more-comments/sub/t3_abc?startingDepth=3&sort=CONFIDENCE']);
});

const SETTINGS = { concurrency: 1, capacity: 99, refillMs: 1 };
const THREAD = 'https://www.reddit.com/r/sub/comments/abc/title/';
const PAGE = 'https://www.reddit.com/r/sub/comments/abc/';
const COMMENT = '<shreddit-comment author="a_example" depth="0" score="1"><div slot="comment"><p>hi</p></div></shreddit-comment>';
const MORE = '<faceplate-partial src="/svc/shreddit/more-comments/sub/t3_abc?x=1" method="post"></faceplate-partial>';

function reddit(handler, extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init?.method, agent: init?.headers['user-agent'] });
    return handler(url, init);
  };
  return { calls, context: { fetchImpl, defaults: SETTINGS, ...extra } };
}

test('more-comments is a POST, every request sends the descriptive agent and the thread page is never requested', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const { calls, context } = reddit(async (url, init) => {
    if (init.method === 'POST') return new Response(COMMENT);
    return new Response(COMMENT + MORE);
  });
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.equal(row.signals, 'live Reddit; score and comment count unavailable; 2 comments read');
  assert.equal(calls.some((call) => call.url === PAGE), false);
  assert.equal(calls.every((call) => call.agent.startsWith('exo-research/')), true);
  assert.equal(calls.some((call) => call.method === 'POST' && call.url.includes('more-comments')), true);
});

test('a listing row labels the live score and comment count it carries', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const listing = '<shreddit-post permalink="/r/sub/comments/abc/title/" post-title="T" score="42" comment-count="7" created-timestamp="2026-11-01T00:00:00Z">';
  const { context } = reddit(async (url) => new Response(url.includes('community-more-posts') ? listing : COMMENT));
  const [row] = await search({ query: '', subreddit: 'sub', limit: 1 }, context);
  assert.equal(row.signals, 'live Reddit; score 42, comments 7; 1 comments read');
});

test('waits past the search limit minus the wait cap fall back instead of running out the clock', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const slept = [];
  const { context } = reddit(async () => new Response('', { status: 429, headers: { 'x-ratelimit-reset': '60' } }));
  context.sleep = async (ms) => slept.push(ms);
  context.defaults = { ...SETTINGS };
  const urls = Array.from({ length: 5 }, (_, index) => `https://www.reddit.com/r/sub/comments/id${index}/t/`);
  await search({ urls, query: '' }, context).catch(() => []);
  assert.equal(slept.reduce((total, ms) => total + ms, 0) <= 300_000 - 65_000, true);
});

test('a refused more-comments follow marks the row truncated with the reason', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const { context } = reddit(async (url, init) => {
    return init.method === 'POST' ? new Response('', { status: 405 }) : new Response(COMMENT + MORE);
  });
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.match(row.signals, /1 comments read; truncated: HTTP 405/);
});

test('an archive post row carries its capture date, counts and the RSS failure reason', async () => {
  const { archiveHits } = await import('../skills/spec/scripts/sources/reddit-discover.mjs');
  const post = { title: 't', permalink: '/r/s/comments/a1/t/', created_utc: 1, selftext: 'b', retrieved_on: 1_761_771_767 };
  const counted = { ...post, score: 7, num_comments: 3 };
  const fetchImpl = async () => new Response(JSON.stringify({ data: [post, counted] }));
  const rows = await archiveHits({}, { text: 'caching', limit: 2, reason: 'HTTP 500' }, { fetchImpl });
  assert.equal(rows[0].signals, 'Arctic Shift archive; retrieved_on 2025-10-29; score and comment count unavailable; live failure: HTTP 500');
  assert.equal(rows[1].signals, 'Arctic Shift archive; retrieved_on 2025-10-29; score 7, comments 3; live failure: HTTP 500');
});

test('a subreddit query with text searches instead of listing the newest posts', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const { calls, context } = reddit(async () => new Response('', { status: 500 }));
  context.defaults = SETTINGS;
  await search({ query: 'caching', subreddit: 'sub', limit: 1 }, context).catch(() => []);
  assert.equal(calls.some((call) => call.url.includes('community-more-posts')), false);
  assert.equal(calls.some((call) => call.url.includes('search.rss?q=caching')), true);
});

test('a failed subreddit-only listing falls back to the archive with its reason and never sends an empty search', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const body = { data: [{ title: 'T', permalink: '/r/foo/comments/abc/t/', created_utc: 1_761_771_767, selftext: '', score: 1, num_comments: 2 }] };
  const { calls, context } = reddit(async (url) => (url.includes('arctic-shift') ? new Response(JSON.stringify(body)) : new Response('', { status: 500 })));
  const rows = await search({ query: 'r/foo', limit: 1 }, context);
  assert.equal(rows.length, 1);
  assert.equal(calls.some((call) => call.url.includes('search.rss?q=&')), false);
  assert.match(rows[0].signals, /Arctic Shift archive/);
});

test('one thread has a total wait budget, not only a per-request one', async () => {
  const { threadWait } = await import('../skills/spec/scripts/sources/reddit-bucket.mjs');
  const wait = threadWait(1000, async () => {});
  await wait.pause(600);
  await assert.rejects(wait.pause(600), /thread wait/);
});

test('an archive-fallback thread keeps the live counts its hit carried', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const tree = { data: [{ kind: 't1', data: { author: 'a', score: 1, body: 'x', retrieved_on: 1_761_771_767 } }] };
  const { context } = reddit(async (url) => (url.includes('arctic-shift') ? new Response(JSON.stringify(tree)) : new Response('', { status: 500 })));
  context.defaults = SETTINGS;
  const [row] = await search({ urls: ['https://www.reddit.com/r/sub/comments/abc/t/'], query: '' }, context);
  assert.match(row.signals, /^Arctic Shift archive; retrieved_on 2025-10-29; score and comment count unavailable; live failure/);
});

test('no thread cap exists beside the search limit', () => {
  assert.doesNotMatch(redditSource, /settings\.threads|threads:/);
});

test('an archive post row keeps its counts when the live thread read fails', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const post = { title: 't', permalink: '/r/sub/comments/a1/t/', created_utc: 1, selftext: 'b', retrieved_on: 1_761_771_767, score: 7, num_comments: 3 };
  const tree = { data: [{ kind: 't1', data: { author: 'a', score: 1, body: 'x', retrieved_on: 1_761_771_767 } }] };
  const { context } = reddit(async (url) => {
    if (url.includes('posts/search')) return new Response(JSON.stringify({ data: [post] }));
    if (url.includes('comments/tree')) return new Response(JSON.stringify(tree));
    return new Response('', { status: 503 });
  });
  context.defaults = SETTINGS;
  const [row] = await search({ query: 'caching', limit: 1 }, context);
  assert.match(row.signals, /score 7, comments 3; live failure/);
});

test('urls past the search limit come back labelled as unread', async () => {
  const { search } = await import('../skills/spec/scripts/sources/reddit.mjs');
  const { context } = reddit(async () => new Response(COMMENT));
  context.defaults = SETTINGS;
  const urls = [THREAD, 'https://www.reddit.com/r/sub/comments/def/other/'];
  const rows = await search({ urls, query: '', limit: 1 }, context);
  assert.match(rows[1].signals, /not read/);
});

test('the archive label and capture date are built by one helper', async () => {
  const { archiveSignals } = await import('../skills/spec/scripts/sources/reddit-archive.mjs');
  assert.equal(archiveSignals({ retrievedOn: '2025-10-29', counts: 'score 1, comments 2', reason: 'HTTP 503' }), 'Arctic Shift archive; retrieved_on 2025-10-29; score 1, comments 2; live failure: HTTP 503');
});
