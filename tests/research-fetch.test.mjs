import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readSources } from '../skills/spec/scripts/ledger.mjs';
import { htmlToText } from '../skills/spec/scripts/page-text.mjs';
import { fetchUrls, savePage } from './research-cli.mjs';
import { tempDir } from './harness.mjs';

const ok = (body) => ['example.com', 200, body, { 'content-type': 'text/html' }];

test('the ledger folds host case, www, hash and tracking params into one url', () => {
  const runDir = tempDir('research-fetch-');
  const routes = [ok('<p>same</p>')];
  const first = fetchUrls(runDir, ['https://WWW.Example.com/a?b=2&utm_source=x&a=1#top'], { routes });
  const second = fetchUrls(runDir, ['https://example.com/a?a=1&b=2'], { routes });
  assert.equal(first.stdout.split('\t')[0], second.stdout.split('\t')[0]);
  assert.equal(readSources(runDir).length, 1);
});

test('htmlToText drops scripts and decodes entities', () => {
  const text = htmlToText('<html><head><title>t</title></head><body><script>x()</script><p>Tom &amp; Jerry</p><p>second</p></body></html>');
  assert.equal(text, 'Tom & Jerry\nsecond');
});

test('fetch.mjs stores page text and one ledger row per canonical URL', () => {
  const runDir = tempDir('research-fetch-');
  const routes = [ok('<p>Hello   world</p>')];
  const first = fetchUrls(runDir, ['https://www.example.com/a?utm_source=x'], { routes });
  const second = fetchUrls(runDir, ['https://example.com/a'], { routes });
  const [ref, url, via] = first.stdout.trim().split('\t');
  assert.equal(via, 'fetched');
  assert.equal(second.stdout.trim(), `${ref}\t${url}\tcached`);
  assert.equal(fs.readFileSync(path.join(runDir, 'pages', `${ref}.txt`), 'utf8'), 'Hello world\n');
  assert.equal(readSources(runDir).length, 1);
});

test('fetch.mjs reuses the stored page without a second request', () => {
  const runDir = tempDir('research-fetch-');
  const routes = [ok('<p>Hello   world</p>')];
  fetchUrls(runDir, ['https://www.example.com/a?utm_source=x'], { routes });
  const second = fetchUrls(runDir, ['https://example.com/a'], { routes });
  assert.equal(second.calls.length, 0);
});

test('fetch.mjs rejects a failed response, exits 1 and keeps no page', () => {
  const runDir = tempDir('research-fetch-');
  const run = fetchUrls(runDir, ['https://example.com/x'], { routes: [['example.com', 404, 'nope']] });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^https:\/\/example\.com\/x\tHTTP 404/);
  assert.equal(fs.existsSync(path.join(runDir, 'pages')), false);
});

test('fetch.mjs spaces two requests to the same host', () => {
  const runDir = tempDir('research-fetch-');
  const env = { EXO_WATCH_GATE_MS: '400' };
  const run = fetchUrls(runDir, ['https://example.com/one', 'https://example.com/two'], { routes: [ok('<p>x</p>')], env });
  assert.equal(run.status, 0);
  const [first, second] = run.calls.map((call) => call.at).sort((a, b) => a - b);
  assert.ok(second - first >= 300);
});

test('fetch.mjs --save stores transcript text from stdin as a page under the same ref scheme', () => {
  const runDir = tempDir('research-fetch-');
  const run = savePage(runDir, 'https://youtu.be/abc', '  spoken words  ');
  assert.equal(run.status, 0);
  const [ref, url, label] = run.stdout.trim().split('\t');
  assert.equal(label, 'saved');
  assert.equal(fs.readFileSync(path.join(runDir, 'pages', `${ref}.txt`), 'utf8'), 'spoken words\n');
  assert.equal(readSources(runDir)[0].ref, ref);
  assert.equal(readSources(runDir)[0].url, url);
});

test('fetch.mjs treats an empty page as blocked and caches nothing', () => {
  const runDir = tempDir('research-fetch-');
  const run = fetchUrls(runDir, ['https://example.com/js'], { routes: [ok('<script>x</script>')] });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /status: blocked/);
  assert.equal(fs.existsSync(path.join(runDir, 'pages')), false);
});

test('fetch.mjs fetches urls together, reports each failure and logs one metric per call', () => {
  const runDir = tempDir('research-fetch-');
  const routes = [['example.com/bad', 404, '<p>ok</p>'], ok('<p>ok</p>')];
  const run = fetchUrls(runDir, ['https://example.com/good', 'https://example.com/bad'], { routes });
  assert.equal(run.status, 0);
  const lines = run.stdout.trim().split('\n');
  assert.match(lines[0], /^\S+\thttps:\/\/example\.com\/good\tfetched$/);
  assert.match(lines[1], /^https:\/\/example\.com\/bad\tHTTP 404/);
  const metrics = fs.readFileSync(path.join(runDir, 'metrics.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(metrics.map((row) => [row.tool, row.ok]).sort(), [['fetch', false], ['fetch', true]]);
});
