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
test('the search CLI forwards --sort and --time into the request', () => {
  const source = fs.readFileSync(new URL('../skills/spec/scripts/search.mjs', import.meta.url), 'utf8');
  assert.match(source, /sort: args\.sort/);
  assert.match(source, /time: args\.time/);
});
