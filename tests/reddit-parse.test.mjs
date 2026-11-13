import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseSearchPage, parseThread, searchUrl } from '../skills/spec/scripts/sources/reddit-text.mjs';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('searchUrl builds the global and subreddit paths', () => {
  const global = searchUrl({ query: 'a b', sort: 'top', time: 'year' });
  assert.equal(global, 'https://www.reddit.com/svc/shreddit/search/?q=a+b&type=posts&sort=top&t=year');
  const scoped = searchUrl({ query: 'x', subreddit: 'example_sub' });
  assert.match(scoped, /\/svc\/shreddit\/r\/example_sub\/search\/\?q=x&type=posts/);
});

test('parseSearchPage returns one hit per thread link', () => {
  const hits = parseSearchPage(fixture('reddit-search.html'));
  assert.deepEqual(hits.map(({ id, subreddit, title }) => [id, subreddit, title]), [
    ['abc123', 'example_sub', 'Example & first title'],
    ['def456', 'other_sub', 'Second title'],
  ]);
  assert.equal(hits[1].url, 'https://www.reddit.com/r/other_sub/comments/def456/second_title/?ref=search');
});

test('parseThread returns the post, flat comments with depth and more stub ids', () => {
  const thread = parseThread(JSON.parse(fixture('reddit-thread.json')));
  assert.deepEqual(thread.post, { id: 'abc123', title: 'Example title', text: 'Post body', author: 'example_user', score: 10, commentCount: 4 });
  assert.deepEqual(thread.comments.map(({ id, depth, score }) => [id, depth, score]), [['c1', 0, 5], ['c2', 1, 2]]);
  assert.deepEqual(thread.moreIds, ['c3', 'c4', 'c5']);
});
