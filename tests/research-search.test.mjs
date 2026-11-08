import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSources } from '../skills/spec/scripts/ledger.mjs';
import { searchSource } from '../skills/spec/scripts/search.mjs';
import { BlockedRoute } from '../skills/spec/scripts/sources/http.mjs';

const FIXTURES = new URL('./fixtures/research/', import.meta.url);

function fixture(name) {
  return fs.readFileSync(new URL(name, FIXTURES), 'utf8');
}

function answering(body, calls = []) {
  return {
    gate: { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'research-gate-')), spacingMs: 0 },
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

const REDDIT_LISTING = JSON.stringify({ data: { children: [{ data: { title: 't', permalink: '/r/x/1/', created_utc: 1704153600, score: 3, num_comments: 2 } }] } });

function redditAnswering(statuses, calls) {
  const context = answering('');
  context.fetchImpl = async (url) => {
    calls.push(url);
    const status = statuses[calls.length - 1];
    return new Response(status === 200 ? REDDIT_LISTING : 'blocked', { status });
  };
  return context;
}

test('reddit listing becomes a ledger row', async () => {
  const calls = [];
  const [row] = await searchSource({ source: 'reddit', query: 'x', limit: 1, runDir: runFolder() }, redditAnswering([200], calls));
  assert.equal(row.url, 'https://reddit.com/r/x/1/');
  assert.equal(calls.length, 1);
});

test('reddit falls back to the second official endpoint', async () => {
  const calls = [];
  const [row] = await searchSource({ source: 'reddit', query: 'x', limit: 1, runDir: runFolder() }, redditAnswering([403, 200], calls));
  assert.equal(row.title, 't');
  assert.match(calls[1], /^https:\/\/www\.reddit\.com\/search\.json/);
});

test('reddit blocked everywhere names the next step', async () => {
  const calls = [];
  const request = { source: 'reddit', query: 'x', limit: 1, runDir: runFolder() };
  await assert.rejects(searchSource(request, redditAnswering([403, 429], calls)), /HTTP 403, HTTP 429; use web search with site:reddit\.com and never WebFetch/);
  assert.equal(calls.length, 2);
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
