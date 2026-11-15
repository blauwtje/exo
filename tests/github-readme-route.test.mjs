import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchUrls } from './research-cli.mjs';

const README = `${'x'.repeat(5295)}\n`;

function apiRoute() {
  const body = JSON.stringify({ encoding: 'base64', content: Buffer.from(README).toString('base64') });
  return ['api.github.com/repos/facebook/react/readme', 200, body, { 'content-type': 'application/json' }];
}

test('a github repository url saves its README whole and reports the byte count', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-route-'));
  const run = fetchUrls(runDir, ['https://github.com/facebook/react'], { routes: [apiRoute()] });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  const lines = run.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const [ref, url, via, file, bytes] = lines[0].split('\t');
  assert.equal(via, 'github-readme');
  assert.equal(Number(bytes), 5296);
  assert.equal(fs.statSync(file).size, 5296);
  assert.equal(fs.readFileSync(file, 'utf8'), README);
  assert.deepEqual(run.calls.map((call) => call.url), ['https://api.github.com/repos/facebook/react/readme']);
  assert.ok(ref && url);
});

test('sources.md names the README route', () => {
  const text = fs.readFileSync(new URL('../skills/spec/references/sources.md', import.meta.url), 'utf8');
  assert.match(text, /fetch\.mjs <run-dir> https:\/\/github\.com\/<owner>\/<repo>` prints the saved path and byte count/);
});
