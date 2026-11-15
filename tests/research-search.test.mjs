import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readSources } from '../skills/spec/scripts/ledger.mjs';
import { fixturePath, runSearch } from './fixtures/search-cli.mjs';
import { tempDir } from './harness.mjs';

const fixture = (name) => fixturePath(`research/${name}`);

function search(source, query, setup = {}) {
  const runDir = tempDir('research-search-');
  const run = runSearch(['--source', source, '--query', query, '--limit', '1', '--run', runDir], setup.world, setup.env);
  return { ...run, runDir, rows: run.lines.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line)) };
}

test('hn hits become ledger rows with native signals', () => {
  const runDir = tempDir('research-search-');
  const run = runSearch(['--source', 'hn', '--query', 'deep research', '--limit', '2', '--run', runDir], { routes: [{ match: 'hn.algolia.com', file: fixture('hn.json') }] });
  const rows = run.lines.map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].signals, { points: 120, comments: 45 });
  assert.equal(rows[0].url, 'https://news.ycombinator.com/item?id=101');
  assert.equal(readSources(runDir).length, 2);
  assert.equal(run.status, 0);
});

test('arxiv feed is parsed into a canonical abstract url', () => {
  const { rows } = search('arxiv', 'agents', { world: { routes: [{ match: 'arxiv.org', file: fixture('arxiv.xml') }] } });
  assert.equal(rows[0].url, 'https://arxiv.org/abs/2401.00001');
  assert.equal(rows[0].title, 'A survey of agents');
  assert.equal(rows[0].date, '2024-01-02');
});

test('github without a logged-in gh falls back to the REST search', () => {
  const body = JSON.stringify({ items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', updated_at: '2025-01-01T00:00:00Z', stargazers_count: 7, description: 'does b' }] });
  const bin = tempDir('no-gh-');
  const { rows, runDir, events } = search('github', 'x', { world: { routes: [{ match: 'api.github.com', body }] }, env: { PATH: bin } });
  assert.equal(rows[0].title, 'a/b');
  assert.equal(rows[0].description, 'does b');
  assert.equal(readSources(runDir).at(-1).description, 'does b');
  assert.match(events.find((event) => event.kind === 'fetch').url, /api\.github\.com/);
});

test('unknown source is refused', () => {
  const run = search('nope', 'x');
  assert.equal(run.status, 1);
  assert.match(run.lines[0], /^status: failed nope unknown source nope/);
});

test('an answer without its result list is a blocked route', () => {
  for (const source of ['wikipedia', 'hn', 'podcast', 'stackoverflow']) {
    const run = search(source, 'x', { world: { routes: [{ match: 'http', body: '{"error":{}}' }] } });
    assert.equal(run.status, 1, source);
    assert.match(run.lines[0], new RegExp(`^status: blocked ${source} answer from https://.* had no result list`), source);
  }
});

test('several sources run together, print a line per failure and log one metric per call', () => {
  const { lines, runDir, status } = search('arxiv,nope', 'agents', { world: { routes: [{ match: 'arxiv.org', file: fixture('arxiv.xml') }] } });
  assert.equal(status, 0);
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
