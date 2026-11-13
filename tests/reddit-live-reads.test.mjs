import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { search } from '../skills/spec/scripts/sources/reddit.mjs';

const SETTINGS = { concurrency: 1, capacity: 99, refillMs: 1 };
const THREAD = 'https://www.reddit.com/r/example_sub/comments/abc123/example_title/';
const SEARCH_PAGE = readFileSync(new URL('./fixtures/reddit-search.html', import.meta.url), 'utf8');
const THREAD_JSON = readFileSync(new URL('./fixtures/reddit-thread.json', import.meta.url), 'utf8');
const MORE_THINGS = JSON.stringify({ json: { data: { things: [
  { kind: 't1', data: { id: 'c3', author: 'example_user', score: 1, body: 'Deep', depth: 2 } },
  { kind: 't1', data: { id: 'c4', author: 'example_user', score: 1, body: 'Deeper', depth: 2 } },
] } } });
const SUBTREE = JSON.stringify([
  { data: { children: [{ data: { id: 'abc123', title: 'Example title', selftext: '', num_comments: 4 } }] } },
  { data: { children: [{ kind: 't1', data: { id: 'c3', author: 'example_user', score: 1, body: 'Deep', replies: '' } }] } },
]);

function browser(handler) {
  const urls = [];
  const pageFetch = async (url) => {
    urls.push(url);
    return handler(url);
  };
  return { urls, context: { pageFetch, defaults: SETTINGS } };
}

const answer = (url) => {
  if (url.includes('/api/morechildren')) return { status: 200, text: MORE_THINGS };
  if (/\/svc\/shreddit\/(?:r\/\w+\/)?search\//.test(url)) return { status: 200, text: SEARCH_PAGE };
  return { status: 200, text: url.includes('/_/') ? SUBTREE : THREAD_JSON };
};

test('a thread read expands more stubs in one morechildren call and counts the comments read', async () => {
  const { urls, context } = browser(answer);
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.equal(urls.length, 3);
  assert.match(urls[0], /\/comments\/abc123\.json\?limit=500&depth=10&sort=top&raw_json=1$/);
  assert.match(urls[1], /\/api\/morechildren\.json\?.*link_id=t3_abc123&children=c3,c4$/);
  assert.match(row.signals, /^read 4 of 4 comments/);
  assert.equal(row.description, 'Post body');
  assert.match(row.comments, /example_user \(score 1, depth 2\): Deep/);
});

test('a search reads each hit thread from the search page and every call goes to reddit.com', async () => {
  const { urls, context } = browser(answer);
  const rows = await search({ query: 'r/example_sub caching', limit: 1, sort: 'top' }, context);
  assert.match(urls[0], /^https:\/\/www\.reddit\.com\/svc\/shreddit\/r\/example_sub\/search\/\?q=caching&type=posts&sort=top/);
  assert.equal(rows.length, 1);
  assert.equal(urls.every((url) => url.startsWith('https://www.reddit.com/')), true);
});

test('a refused more stub marks the row truncated and keeps the comments read', async () => {
  const { context } = browser((url) => (url.includes('/_/') || url.includes('/api/morechildren') ? { status: 500, text: '' } : answer(url)));
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.match(row.signals, /read 2 of 4 comments; 3 ids unread; truncated: HTTP 500/);
});

test('a refused thread read is a blocked route with the status', async () => {
  const { context } = browser(() => ({ status: 429, text: '' }));
  await assert.rejects(search({ urls: [THREAD], query: '' }, context), /HTTP 429/);
});

test('urls past the search limit come back labelled as unread', async () => {
  const { context } = browser(answer);
  const urls = [THREAD, 'https://www.reddit.com/r/example_sub/comments/def456/other/'];
  const rows = await search({ urls, query: '', limit: 1 }, context);
  assert.match(rows[1].signals, /not read/);
});
