import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../lib/check-citations.mjs', import.meta.url));
const PAGE_PATH = '/page';
const PAGE_TEXT = 'The  quick\nbrown fox jumps.';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function withPageServer(run) {
  const requested = [];
  const server = http.createServer((request, response) => {
    requested.push(request.url);
    response.statusCode = request.url === PAGE_PATH ? 200 : 404;
    response.end(request.url === PAGE_PATH ? PAGE_TEXT : 'not found');
  });
  const port = await listen(server);
  try {
    await run({ origin: `http://127.0.0.1:${port}`, requested });
  } finally {
    await close(server);
  }
}

function runCli(citesFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, citesFile]);
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, lines: stdout.split('\n').filter(Boolean) }));
  });
}

function writeCites(dir, citations) {
  const file = path.join(dir, 'cites.json');
  fs.writeFileSync(file, JSON.stringify(citations));
  return file;
}

test('check-citations marks a quote verified, missing or unreachable', async () => {
  await withPageServer(async ({ origin }) => {
    const file = writeCites(tempDir('cites-'), [
      { url: `${origin}${PAGE_PATH}`, quote: 'Quick brown fox' },
      { url: `${origin}${PAGE_PATH}`, quote: 'lazy dog' },
      { url: `${origin}/gone`, quote: 'anything' }
    ]);
    const { status, lines } = await runCli(file);
    assert.deepEqual(lines, [`verified ${origin}${PAGE_PATH}`, `missing ${origin}${PAGE_PATH}`, `unreachable ${origin}/gone`]);
    assert.equal(status, 1);
  });
});

test('check-citations verifies a cited Reddit url from the saved page beside the cites file', async () => {
  await withPageServer(async ({ origin, requested }) => {
    const dir = tempDir('cites-');
    const url = 'https://www.reddit.com/r/test/comments/abc123/title/';
    fs.writeFileSync(path.join(dir, 'sources.jsonl'), `${JSON.stringify({ ref: 'r1', url, url_fetched: url })}\n`);
    fs.writeFileSync(path.join(dir, 't-abc123.txt'), 'Comment: the  Quick brown fox');
    const file = writeCites(dir, [{ url, quote: 'quick brown fox' }, { url: `${origin}${PAGE_PATH}`, quote: 'brown fox' }]);
    const { status, lines } = await runCli(file);
    assert.deepEqual(lines, [`verified ${url}`, `verified ${origin}${PAGE_PATH}`]);
    assert.deepEqual(requested, [PAGE_PATH]);
    assert.equal(status, 0);
  });
});

test('check-citations fetches the url when no sources.jsonl sits beside the cites file', async () => {
  await withPageServer(async ({ origin, requested }) => {
    const file = writeCites(tempDir('cites-'), [{ url: `${origin}${PAGE_PATH}`, quote: 'brown fox' }]);
    const { status, lines } = await runCli(file);
    assert.deepEqual(lines, [`verified ${origin}${PAGE_PATH}`]);
    assert.deepEqual(requested, [PAGE_PATH]);
    assert.equal(status, 0);
  });
});
