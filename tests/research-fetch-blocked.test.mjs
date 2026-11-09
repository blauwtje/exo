import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchPage } from '../skills/spec/scripts/fetch.mjs';
import { pagePath } from '../skills/spec/scripts/ledger.mjs';

const gate = { dir: undefined, spacingMs: 0 };
const CHALLENGE = '<html><head><title>Just a moment...</title></head><body>Enable JavaScript</body></html>';
const REAL = `<html><body><p>${'Real article text. '.repeat(10)}</p></body></html>`;
const html = { 'content-type': 'text/html' };
const noBrowser = async () => null;

function runFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'research-blocked-'));
}

function router(table, calls = []) {
  return async (url) => {
    calls.push(url);
    const hit = table.find(([match]) => url.includes(match));
    if (!hit) return new Response('missing', { status: 404 });
    const [, status, body, headers = html] = hit;
    return new Response(body, { status, headers });
  };
}

function attempt(url, fetchImpl, extra = {}) {
  return fetchPage(url, { runDir: runFolder(), fetchImpl, gate, render: noBrowser, ...extra });
}

test('Cloudflare 403 is blocked as challenge and writes no page file', async () => {
  const runDir = runFolder();
  const fetchImpl = router([['example.com', 403, CHALLENGE, { ...html, server: 'cloudflare' }]]);
  await assert.rejects(
    attempt('https://example.com/a', fetchImpl, { runDir }),
    (error) => error.reason === 'challenge' && /status: blocked challenge; open it in your browser/.test(error.message),
  );
  assert.equal(fs.existsSync(pagePath(runDir, 'S1')), false);
});

test('a 200 Just a moment body is blocked', async () => {
  const fetchImpl = router([['example.com', 200, CHALLENGE]]);
  await assert.rejects(attempt('https://example.com/a', fetchImpl), (error) => error.reason === 'challenge');
});

test('a challenge falls back to the Wayback snapshot and labels it archived', async () => {
  const calls = [];
  const available = JSON.stringify({ archived_snapshots: { closest: { available: true, timestamp: '20240102030405' } } });
  const fetchImpl = router(
    [
      ['archive.org/wayback/available', 200, available, { 'content-type': 'application/json' }],
      ['web.archive.org/web/20240102030405id_/', 200, REAL],
      ['example.com', 403, CHALLENGE, { ...html, 'cf-mitigated': 'challenge' }],
    ],
    calls,
  );
  const page = await attempt('https://example.com/a', fetchImpl);
  assert.equal(page.via, 'archived 2024-01-02');
  assert.match(fs.readFileSync(page.file, 'utf8'), /Real article text/);
  assert.ok(calls.some((url) => url.startsWith('https://web.archive.org/web/20240102030405id_/https://example.com/a')));
});

test('a stubbed browser render rescues a blocked page and is itself checked', async () => {
  const fetchImpl = router([['example.com', 403, CHALLENGE, { ...html, server: 'cloudflare' }]]);
  const page = await attempt('https://example.com/a', fetchImpl, { render: async () => REAL });
  assert.equal(page.via, 'browser');
  await assert.rejects(
    attempt('https://example.com/b', fetchImpl, { render: async () => CHALLENGE }),
    (error) => error.reason === 'challenge',
  );
});

test('an age gate with a same-origin confirm link is followed', async () => {
  const gatePage = '<html><body><h1>Are you over 18?</h1><a href="/enter?ok=1">Enter</a></body></html>';
  const fetchImpl = router([
    ['example.com/enter?ok=1', 200, REAL],
    ['example.com', 200, gatePage],
  ]);
  const page = await attempt('https://example.com/', fetchImpl);
  assert.match(fs.readFileSync(page.file, 'utf8'), /Real article text/);
});

test('an age gate link to another origin is not followed', async () => {
  const gatePage = '<html><body><h1>Are you over 18?</h1><a href="https://other.test/x">Enter</a></body></html>';
  const calls = [];
  const fetchImpl = router([['example.com', 200, gatePage]], calls);
  await assert.rejects(attempt('https://example.com/', fetchImpl), (error) => error.reason === 'age-gate');
  assert.ok(!calls.some((url) => url.includes('other.test')));
});

test('a Khoros thread is read from the board feed when the page is challenged', async () => {
  const feed =
    '<rss><channel><item><title>Door bug</title><link>https://forums.example.com/discussions/board-a/door-bug/777</link><description>&lt;p&gt;The door is stuck for me.&lt;/p&gt;</description></item></channel></rss>';
  const fetchImpl = router([
    ['rss/board?board.id=board-a', 200, feed, { 'content-type': 'text/xml' }],
    ['forums.example.com', 403, CHALLENGE, { ...html, server: 'cloudflare' }],
  ]);
  const page = await attempt('https://forums.example.com/discussions/board-a/door-bug/777', fetchImpl);
  assert.match(fs.readFileSync(page.file, 'utf8'), /door is stuck/);
});

test('a Sheets URL goes through the CSV route', async () => {
  const calls = [];
  const fetchImpl = router([['export?format=csv', 200, 'a,b\n1,2', { 'content-type': 'text/csv' }]], calls);
  const page = await attempt('https://docs.google.com/spreadsheets/d/abc123/edit#gid=5', fetchImpl);
  assert.equal(fs.readFileSync(page.file, 'utf8'), 'a,b\n1,2\n');
  assert.match(calls[0], /abc123\/export\?format=csv&gid=5/);
});

test('a private Sheet is blocked as not-public', async () => {
  const fetchImpl = router([['docs.google.com', 200, '<html>sign in</html>']]);
  await assert.rejects(
    attempt('https://docs.google.com/spreadsheets/d/abc123/edit', fetchImpl),
    (error) => error.reason === 'not-public',
  );
});

test('the CLI prints the blocked line on stdout, exits 1 when every url failed and writes no page', () => {
  const runDir = runFolder();
  const script = path.resolve('skills/spec/scripts/fetch.mjs');
  const stub = path.join(runDir, 'stub.mjs');
  const body = JSON.stringify(CHALLENGE);
  fs.writeFileSync(stub, `globalThis.fetch = async () => new Response(${body}, { status: 403, headers: { server: 'cloudflare', 'content-type': 'text/html' } });\n`);
  const result = spawnSync(process.execPath, ['--import', stub, script, runDir, 'https://example.com/a'], { encoding: 'utf8', timeout: 50000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^https:\/\/example\.com\/a\tstatus: blocked challenge; open it in your browser and save the text with: node fetch\.mjs --save .+ https:\/\/example\.com\/a < text/m);
  assert.equal(fs.existsSync(pagePath(runDir, 'S1')), false);
});

test('getText refuses a url already memoed as blocked without a network call', async () => {
  const { getText, BlockedRoute } = await import('../skills/spec/scripts/sources/http.mjs');
  const { createHostState } = await import('../skills/spec/scripts/sources/host-state.mjs');
  const stateDir = runFolder();
  createHostState({ dir: stateDir }).recordBlocked('https://example.com/a');
  const calls = [];
  const fetchImpl = router([['example.com', 200, REAL]], calls);
  await assert.rejects(getText('https://example.com/a', { fetchImpl, gate, stateDir }), BlockedRoute);
  assert.equal(calls.length, 0);
});

test('a blocked page is memoed so the run dir remembers it', async () => {
  const { createHostState } = await import('../skills/spec/scripts/sources/host-state.mjs');
  const runDir = runFolder();
  const fetchImpl = router([['example.com', 403, CHALLENGE, { ...html, server: 'cloudflare' }]]);
  await assert.rejects(attempt('https://example.com/a', fetchImpl, { runDir }), (error) => error.reason === 'challenge');
  assert.equal(createHostState({ dir: runDir }).isBlocked('https://example.com/a'), true);
});

test('the CLI fetching 3 urls with 1 blocked prints 3 stdout lines and exits 0', () => {
  const runDir = runFolder();
  const script = path.resolve('skills/spec/scripts/fetch.mjs');
  const stub = path.join(runDir, 'stub.mjs');
  const body = JSON.stringify(CHALLENGE);
  const real = JSON.stringify(REAL);
  fs.writeFileSync(stub, `globalThis.fetch = async (url) => String(url).endsWith('/b') ? new Response(${body}, { status: 403, headers: { server: 'cloudflare', 'content-type': 'text/html' } }) : new Response(${real}, { headers: { 'content-type': 'text/html' } });\n`);
  const urls = ['https://one.example.com/a', 'https://two.example.com/b', 'https://three.example.com/c'];
  const result = spawnSync(process.execPath, ['--import', stub, script, runDir, ...urls], { encoding: 'utf8', timeout: 50000 });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split('\n').length, 3);
  assert.match(result.stdout, /two\.example\.com\/b\tstatus: blocked challenge/);
  assert.equal(result.stderr, '');
});
