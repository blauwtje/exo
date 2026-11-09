import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchMany } from '../skills/spec/scripts/fetch.mjs';

const README = `${'x'.repeat(5295)}\n`;
const gate = { dir: undefined, spacingMs: 0 };

function apiStub(calls) {
  return async (url) => {
    calls.push(url);
    const body = JSON.stringify({ encoding: 'base64', content: Buffer.from(README).toString('base64') });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('a github repository url saves its README whole and reports the byte count', async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-route-'));
  const calls = [];
  const { lines, failures } = await fetchMany(['https://github.com/facebook/react'], { runDir, fetchImpl: apiStub(calls), gate });
  assert.deepEqual(failures, []);
  const [ref, url, via, file, bytes] = lines[0].split('\t');
  assert.equal(via, 'github-readme');
  assert.equal(Number(bytes), 5296);
  assert.equal(fs.statSync(file).size, 5296);
  assert.equal(fs.readFileSync(file, 'utf8'), README);
  assert.deepEqual(calls, ['https://api.github.com/repos/facebook/react/readme']);
  assert.ok(ref && url);
});

test('sources.md names the README route', () => {
  const text = fs.readFileSync(new URL('../skills/spec/references/sources.md', import.meta.url), 'utf8');
  assert.match(text, /fetch\.mjs <run-dir> https:\/\/github\.com\/<owner>\/<repo>` prints the saved path and byte count/);
});
