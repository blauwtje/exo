import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pagePath } from '../skills/spec/scripts/ledger.mjs';
import { fetchUrls } from './research-cli.mjs';
import { tempDir } from './harness.mjs';

const gate = { dir: undefined, spacingMs: 0 };
const CHALLENGE = '<html><head><title>Just a moment...</title></head><body>Enable JavaScript</body></html>';
const REAL = `<html><body><p>${'Real article text. '.repeat(10)}</p></body></html>`;
const html = { 'content-type': 'text/html' };
const cloudflare = { ...html, server: 'cloudflare' };

function router(table, calls = []) {
  return async (url) => {
    calls.push(url);
    const hit = table.find(([match]) => url.includes(match));
    if (!hit) return new Response('missing', { status: 404 });
    const [, status, body, headers = html] = hit;
    return new Response(body, { status, headers });
  };
}

function attempt(url, routes, options = {}) {
  const runDir = options.runDir ?? tempDir('research-blocked-');
  const run = fetchUrls(runDir, [url], { routes, renders: options.renders });
  return { ...run, runDir };
}

function savedText(run) {
  const [ref] = run.stdout.split('\t');
  return fs.readFileSync(pagePath(run.runDir, ref), 'utf8');
}

function blockedWith(run, reason) {
  return run.status === 1 && new RegExp(`\\tstatus: blocked ${reason}; open it in your browser`).test(run.stdout);
}

test('Cloudflare 403 is blocked as challenge and writes no page file', () => {
  const run = attempt('https://example.com/a', [['example.com', 403, CHALLENGE, cloudflare]]);
  assert.equal(blockedWith(run, 'challenge'), true);
  assert.match(run.stdout, /status: blocked challenge; open it in your browser/);
  assert.equal(fs.existsSync(pagePath(run.runDir, 'S1')), false);
  assert.equal(fs.existsSync(path.join(run.runDir, 'pages')), false);
});

test('a 200 Just a moment body is blocked', () => {
  const run = attempt('https://example.com/a', [['example.com', 200, CHALLENGE]]);
  assert.equal(blockedWith(run, 'challenge'), true);
});

test('a challenge falls back to the Wayback snapshot and labels it archived', () => {
  const available = JSON.stringify({ archived_snapshots: { closest: { available: true, timestamp: '20240102030405' } } });
  const routes = [
    ['archive.org/wayback/available', 200, available, { 'content-type': 'application/json' }],
    ['web.archive.org/web/20240102030405id_/', 200, REAL],
    ['example.com', 403, CHALLENGE, { ...html, 'cf-mitigated': 'challenge' }],
  ];
  const run = attempt('https://example.com/a', routes);
  assert.match(run.stdout, /\tarchived 2024-01-02$/m);
  assert.match(savedText(run), /Real article text/);
  assert.ok(run.calls.some((call) => call.url.startsWith('https://web.archive.org/web/20240102030405id_/https://example.com/a')));
});

test('a stubbed browser render rescues a blocked page and is itself checked', () => {
  const routes = [['example.com', 403, CHALLENGE, cloudflare]];
  const rescued = attempt('https://example.com/a', routes, { renders: [['example.com/a', REAL]] });
  assert.match(rescued.stdout, /\tbrowser$/m);
  const checked = attempt('https://example.com/b', routes, { renders: [['example.com/b', CHALLENGE]] });
  assert.equal(blockedWith(checked, 'challenge'), true);
});

test('an age gate with a same-origin confirm link is followed', () => {
  const gatePage = '<html><body><h1>Are you over 18?</h1><a href="/enter?ok=1">Enter</a></body></html>';
  const run = attempt('https://example.com/', [
    ['example.com/enter?ok=1', 200, REAL],
    ['example.com', 200, gatePage],
  ]);
  assert.match(savedText(run), /Real article text/);
});

test('an age gate link to another origin is not followed', () => {
  const gatePage = '<html><body><h1>Are you over 18?</h1><a href="https://other.test/x">Enter</a></body></html>';
  const run = attempt('https://example.com/', [['example.com', 200, gatePage]]);
  assert.equal(blockedWith(run, 'age-gate'), true);
  assert.ok(!run.calls.some((call) => call.url.includes('other.test')));
});

test('a Khoros thread is read from the board feed when the page is challenged', () => {
  const feed =
    '<rss><channel><item><title>Door bug</title><link>https://forums.example.com/discussions/board-a/door-bug/777</link><description>&lt;p&gt;The door is stuck for me.&lt;/p&gt;</description></item></channel></rss>';
  const run = attempt('https://forums.example.com/discussions/board-a/door-bug/777', [
    ['rss/board?board.id=board-a', 200, feed, { 'content-type': 'text/xml' }],
    ['forums.example.com', 403, CHALLENGE, cloudflare],
  ]);
  assert.match(savedText(run), /door is stuck/);
});

test('a Sheets URL goes through the CSV route', () => {
  const run = attempt('https://docs.google.com/spreadsheets/d/abc123/edit#gid=5', [['export?format=csv', 200, 'a,b\n1,2', { 'content-type': 'text/csv' }]]);
  assert.equal(savedText(run), 'a,b\n1,2\n');
  assert.match(run.calls[0].url, /abc123\/export\?format=csv&gid=5/);
});

test('a private Sheet is blocked as not-public', () => {
  const run = attempt('https://docs.google.com/spreadsheets/d/abc123/edit', [['docs.google.com', 200, '<html>sign in</html>']]);
  assert.equal(blockedWith(run, 'not-public'), true);
});

test('the CLI prints the blocked line on stdout, exits 1 when every url failed and writes no page', () => {
  const run = attempt('https://example.com/a', [['example.com', 403, CHALLENGE, cloudflare]]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^https:\/\/example\.com\/a\tstatus: blocked challenge; open it in your browser and save the text with: node fetch\.mjs --save .+ https:\/\/example\.com\/a < text/m);
  assert.equal(fs.existsSync(pagePath(run.runDir, 'S1')), false);
});

test('getText refuses a url already memoed as blocked without a network call', async () => {
  const { getText, BlockedRoute } = await import('../skills/spec/scripts/sources/http.mjs');
  const { createHostState } = await import('../skills/spec/scripts/sources/host-state.mjs');
  const stateDir = tempDir('research-blocked-');
  createHostState({ dir: stateDir }).recordBlocked('https://example.com/a');
  const calls = [];
  const fetchImpl = router([['example.com', 200, REAL]], calls);
  await assert.rejects(getText('https://example.com/a', { fetchImpl, gate, stateDir }), (error) => error instanceof BlockedRoute && error.message.startsWith('https://example.com/a was blocked'));
  assert.equal(calls.length, 0);
});

test('a blocked page is memoed so the run dir remembers it', async () => {
  const { createHostState } = await import('../skills/spec/scripts/sources/host-state.mjs');
  const run = attempt('https://example.com/a', [['example.com', 403, CHALLENGE, cloudflare]]);
  assert.equal(blockedWith(run, 'challenge'), true);
  assert.equal(createHostState({ dir: run.runDir }).isBlocked('https://example.com/a'), true);
});

test('the CLI fetching 3 urls with 1 blocked prints 3 stdout lines and exits 0', () => {
  const urls = ['https://one.example.com/a', 'https://two.example.com/b', 'https://three.example.com/c'];
  const routes = [['two.example.com', 403, CHALLENGE, cloudflare], ['example.com', 200, REAL]];
  const result = fetchUrls(tempDir('research-blocked-'), urls, { routes });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split('\n').length, 3);
  assert.match(result.stdout, /two\.example\.com\/b\tstatus: blocked challenge/);
  assert.equal(result.stderr, '');
});
