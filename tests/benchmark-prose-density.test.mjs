// benchmarks/prose-density.mjs scores articles per 100 words of chat prose:
// full prose lands above 5.0, terse prose at or below 2.0, and text inside
// fences, inline code, paths, URLs, quotes, blockquotes and table rows is
// left out.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreProse } from '../benchmarks/prose-density.mjs';

const FULL_PROSE = 'The limiter keeps a list of timestamps for each client. When a request arrives, the function drops the entries that are older than the window and then checks whether the count is below the limit. If it is, the request is allowed and the current time is added to the list, so the next call sees an accurate count.';
const TERSE_PROSE = 'Limiter keeps timestamps per client. Request arrives: allow drops entries older than window, checks count against limit. Under limit: allow request, append current time. Next call sees accurate count. Clock skew shows as negative ages; entries never expire.';

test('full prose scores above 5.0', () => {
  const score = scoreProse(FULL_PROSE);
  assert.ok(score.words >= 25);
  assert.ok(score.articleRate > 5.0, `rate ${score.articleRate}`);
});

test('terse prose scores at or below 2.0', () => {
  const score = scoreProse(TERSE_PROSE);
  assert.ok(score.words >= 25);
  assert.ok(score.articleRate <= 2.0, `rate ${score.articleRate}`);
});

test('the result carries words, articles, linkingVerbs and a one-decimal rate', () => {
  assert.deepEqual(scoreProse('The cat is here. A dog was there. Be quiet.'), {
    words: 10, articles: 2, linkingVerbs: 3, articleRate: 20,
  });
  assert.equal(scoreProse('').articleRate, 0);
  assert.equal(scoreProse('the fox jumps over lazy dogs').articleRate, 16.7);
});

test('articles that sit only in excluded spans score 0', () => {
  const excluded = [
    '```js\n// the a an\nconst the = a;\n```',
    'Run `the a an` now',
    'See the/path/a/an.txt',
    'Open a.mjs',
    'Visit https://example.com/the/a/an',
    'He said "the a an" loudly',
    'He said “the a an” loudly',
    '> the a an',
    '| the | a | an |',
  ];
  for (const text of excluded) {
    assert.equal(scoreProse(text).articles, 0, text);
  }
});

test('an unclosed fence hides the rest of the text', () => {
  assert.equal(scoreProse('Plain words\n```\nthe a an').articles, 0);
});

test('prose next to excluded spans still counts', () => {
  const score = scoreProse('The `x` in "quoted" text: a b.\n> the\n| a |');
  assert.equal(score.articles, 2);
});
