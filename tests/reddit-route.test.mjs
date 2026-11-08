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

test('the deny names the script under CLAUDE_PLUGIN_ROOT and the WebSearch fallback', () => {
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = '/opt/exo';
  try {
    const { deny } = redditRouteDecision(fetchUrl('https://old.reddit.com/r/a'));
    assert.ok(deny.includes('node "/opt/exo/skills/spec/scripts/search.mjs" --source reddit'));
    assert.match(deny, /site:reddit\.com/);
    assert.doesNotMatch(deny, /CLAUDE_SKILL_DIR/);
    delete process.env.CLAUDE_PLUGIN_ROOT;
    assert.ok(redditRouteDecision(fetchUrl('https://old.reddit.com/r/a')).deny.includes('node "skills/spec/scripts/search.mjs"'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = saved;
  }
});
