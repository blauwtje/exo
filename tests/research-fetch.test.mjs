import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchPage, savePageText } from '../skills/spec/scripts/fetch.mjs';
import { canonicalUrl, readSources } from '../skills/spec/scripts/ledger.mjs';
import { htmlToText } from '../skills/spec/scripts/page-text.mjs';

function runFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'research-fetch-'));
}

function fakeFetch(html, calls) {
  return async (url) => {
    calls.push(url);
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  };
}

const gate = { dir: undefined, spacingMs: 0 };

test('canonicalUrl folds host case, www, hash and tracking params', () => {
  const a = canonicalUrl('https://WWW.Example.com/a?b=2&utm_source=x&a=1#top');
  const b = canonicalUrl('https://example.com/a?a=1&b=2');
  assert.equal(a, b);
});

test('htmlToText drops scripts and decodes entities', () => {
  const text = htmlToText('<html><head><title>t</title></head><body><script>x()</script><p>Tom &amp; Jerry</p><p>second</p></body></html>');
  assert.equal(text, 'Tom & Jerry\nsecond');
});

test('fetchPage stores page text and one ledger row per canonical URL', async () => {
  const runDir = runFolder();
  const calls = [];
  const options = { runDir, fetchImpl: fakeFetch('<p>Hello   world</p>', calls), gate: { ...gate, dir: runFolder() } };
  const first = await fetchPage('https://www.example.com/a?utm_source=x', options);
  const second = await fetchPage('https://example.com/a', options);
  assert.equal(first.ref, second.ref);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(fs.readFileSync(first.file, 'utf8'), 'Hello world\n');
  assert.equal(readSources(runDir).length, 1);
});

test('fetchPage rejects a failed response and keeps no page', async () => {
  const runDir = runFolder();
  const fetchImpl = async () => new Response('nope', { status: 404 });
  await assert.rejects(fetchPage('https://example.com/x', { runDir, fetchImpl, gate: { ...gate, dir: runFolder() } }), /HTTP 404/);
  assert.equal(fs.existsSync(path.join(runDir, 'pages')), false);
});

test('fetchPage spaces two requests to the same host', async () => {
  const runDir = runFolder();
  const sleeps = [];
  let clock = 1000;
  const gateOptions = { dir: runFolder(), spacingMs: 500, jitterMs: 0, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; } };
  const options = { runDir, fetchImpl: fakeFetch('<p>x</p>', []), gate: gateOptions };
  await fetchPage('https://example.com/one', options);
  await fetchPage('https://example.com/two', options);
  assert.ok(sleeps.some((ms) => ms > 0));
});

test('savePageText stores transcript text under the same ref scheme', async () => {
  const runDir = runFolder();
  const page = await savePageText('https://youtu.be/abc', '  spoken words  ', { runDir });
  assert.equal(fs.readFileSync(page.file, 'utf8'), 'spoken words\n');
  assert.equal(readSources(runDir)[0].ref, page.ref);
});

test('fetchPage treats an empty page as blocked and caches nothing', async () => {
  const runDir = runFolder();
  const options = { runDir, fetchImpl: fakeFetch('<script>x</script>', []), gate: { ...gate, dir: runFolder() } };
  await assert.rejects(fetchPage('https://example.com/js', options), /status: blocked/);
  assert.equal(fs.existsSync(path.join(runDir, 'pages')), false);
});

test('fetch.mjs --save stores transcript text from stdin as a page', () => {
  const runDir = runFolder();
  const script = new URL('../skills/spec/scripts/fetch.mjs', import.meta.url).pathname;
  const run = spawnSync('node', [script, '--save', runDir, 'https://example.com/v'], { input: 'spoken words', encoding: 'utf8' });
  assert.equal(run.status, 0);
  const [ref] = run.stdout.split('\t');
  assert.equal(fs.readFileSync(path.join(runDir, 'pages', `${ref}.txt`), 'utf8'), 'spoken words\n');
});

test('fetchMany fetches urls together, reports each failure and logs one metric per call', async () => {
  const { fetchMany } = await import('../skills/spec/scripts/fetch.mjs');
  const runDir = runFolder();
  const fetchImpl = async (url) => new Response('<p>ok</p>', { status: url.endsWith('/bad') ? 404 : 200, headers: { 'content-type': 'text/html' } });
  const urls = ['https://example.com/good', 'https://example.com/bad'];
  const { lines, failed } = await fetchMany(urls, { runDir, fetchImpl, gate: { ...gate, dir: runFolder() } });
  assert.equal(failed, false);
  assert.match(lines[0], /^\S+\thttps:\/\/example\.com\/good\tfetched$/);
  assert.match(lines[1], /^https:\/\/example\.com\/bad\tHTTP 404/);
  const metrics = fs.readFileSync(path.join(runDir, 'metrics.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(metrics.map((row) => [row.tool, row.ok]).sort(), [['fetch', false], ['fetch', true]]);
});
