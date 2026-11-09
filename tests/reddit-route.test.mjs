import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redditRouteDecision } from '../lib/reddit-route.mjs';
import { contextHook } from '../hooks/context-limit.mjs';

const search = (query) => ({ tool_name: 'WebSearch', tool_input: { query } });
const fetchUrl = (url) => ({ tool_name: 'WebFetch', tool_input: { url, prompt: 'x' } });

test('WebFetch of reddit hosts and mirrors is denied', () => {
  for (const url of ['https://old.reddit.com/r/a', 'https://www.reddit.com/r/a', 'https://redd.it/x', 'https://redlib.example.org/r/a', 'https://libreddit.de/r/a']) {
    assert.match(redditRouteDecision(fetchUrl(url)).deny, /--source reddit/);
  }
});

test('WebFetch of other hosts passes', () => {
  assert.equal(redditRouteDecision(fetchUrl('https://example.com/reddit')), null);
  assert.equal(redditRouteDecision(fetchUrl('not a url')), null);
});

test('WebSearch with bare reddit or r/<sub> is denied', () => {
  assert.ok(redditRouteDecision(search('best editor reddit')));
  assert.ok(redditRouteDecision(search('r/neovim plugins')));
});

test('WebSearch with a site operator or no reddit passes', () => {
  assert.equal(redditRouteDecision(search('site:reddit.com best editor')), null);
  assert.equal(redditRouteDecision(search('site:reddit.com/r/neovim plugins')), null);
  assert.equal(redditRouteDecision(search('best editor')), null);
  assert.equal(redditRouteDecision({ tool_name: 'Read', tool_input: {} }), null);
});

test('the context hook emits the deny', () => {
  const out = contextHook(search('foo reddit'));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('the deny names the script, its --run argument and the WebSearch fallback', () => {
  const { deny } = redditRouteDecision(fetchUrl('https://old.reddit.com/r/a'));
  assert.match(deny, /node \/.*\/skills\/spec\/scripts\/search\.mjs --source reddit --query <text> --run <run-dir>/);
  assert.match(deny, /site:reddit\.com/);
});

test('searches about Reddit as a subject pass', () => {
  for (const query of ['reddit ipo price', 'reddit api pricing changes', 'what is reddit', 'reddit layoffs news']) {
    assert.equal(redditRouteDecision(search(query)), null, query);
  }
});

test('thread-seeking searches are routed', () => {
  for (const query of ['best editor on reddit', 'neovim reddit', 'reddit thread about vim', 'r/neovim plugins']) {
    assert.ok(redditRouteDecision(search(query)), query);
  }
});

test('every refusal is one line of at most 320 characters', () => {
  const decisions = [fetchUrl('https://old.reddit.com/r/a'), search('best editor reddit')].map(redditRouteDecision);
  for (const { deny } of decisions) {
    assert.ok(deny.length <= 320, String(deny.length));
    assert.doesNotMatch(deny, /\n/);
  }
});

test('the deny carries a Do instead clause within 320 characters', () => {
  const { deny } = redditRouteDecision(fetchUrl('https://old.reddit.com/r/a'));
  assert.match(deny, /Do instead: .*--run <run-dir>/);
  assert.ok(deny.length <= 320);
});
