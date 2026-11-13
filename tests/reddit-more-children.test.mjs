import assert from 'node:assert/strict';
import test from 'node:test';
import { search } from '../skills/spec/scripts/sources/reddit.mjs';

const THREAD = 'https://www.reddit.com/r/example_sub/comments/abc123/example_title/';
const IDS = Array.from({ length: 250 }, (_, index) => `k${index}`);
const THREAD_JSON = JSON.stringify([
  { data: { children: [{ data: { id: 'abc123', title: 'Example title', selftext: '', num_comments: 250 } }] } },
  { data: { children: [{ kind: 'more', data: { children: IDS, parent_id: 't3_abc123' } }] } },
]);

function thingsFor(url) {
  const ids = url.match(/&children=([^&]+)/)[1].split(',');
  const things = ids.map((id) => ({ kind: 't1', data: { id, author: 'example_user', score: 1, body: `text ${id}` } }));
  return JSON.stringify({ json: { data: { things } } });
}

function browser(handler, settings = {}) {
  const urls = [];
  const pageFetch = async (url) => {
    urls.push(url);
    return handler(url);
  };
  const defaults = { concurrency: 1, capacity: 999, refillMs: 1, ...settings };
  return { urls, context: { pageFetch, defaults } };
}

const morechildren = (url) => url.includes('/api/morechildren');

test('a 250 id stub is read in 3 morechildren calls', async () => {
  const { urls, context } = browser((url) => ({ status: 200, text: morechildren(url) ? thingsFor(url) : THREAD_JSON }));
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.equal(urls.filter(morechildren).length, 3);
  assert.match(row.signals, /^read 250 of 250 comments$/);
});

test('a morechildren error status falls back to one refetch per id', async () => {
  const { urls, context } = browser((url) => {
    if (morechildren(url)) return { status: 500, text: '' };
    const child = url.match(/\/_\/(\w+)\.json/)?.[1];
    if (!child) return { status: 200, text: THREAD_JSON };
    const comment = { kind: 't1', data: { id: child, author: 'example_user', score: 1, body: 'x', replies: '' } };
    const post = { data: { children: [{ data: { id: 'abc123', title: 'Example title', selftext: '', num_comments: 250 } }] } };
    return { status: 200, text: JSON.stringify([post, { data: { children: [comment] } }]) };
  });
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.equal(urls.filter(morechildren).length, 1);
  assert.equal(urls.filter((url) => url.includes('/_/')).length, 250);
  assert.match(row.signals, /^read 250 of 250 comments$/);
});

test('the thread time budget stops expansion and reports the unread ids', async () => {
  let clock = 0;
  const { context } = browser((url) => {
    clock += 100;
    return { status: 200, text: morechildren(url) ? thingsFor(url) : THREAD_JSON };
  }, { threadMs: 50 });
  context.now = () => clock;
  const [row] = await search({ urls: [THREAD], query: '' }, context);
  assert.match(row.signals, /^read 100 of 250 comments; 150 ids unread$/);
});
