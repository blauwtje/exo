import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

const script = path.resolve('skills/watch/scripts/list.mjs');

const FAKE_YT_DLP = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args.includes('--version')) { console.log('2025.01.01'); process.exit(0); }
const reply = JSON.parse(fs.readFileSync(process.env.FAKE_REPLY, 'utf8'));
if (reply.hang) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
if (reply.error) { console.error('WARNING: noise'); console.error(reply.error); process.exit(1); }
console.log(JSON.stringify(reply.json));
`;

const PROFILE_URL = 'https://www.tiktok.com/@example';

const TIKTOK_PROFILE = {
  _type: 'playlist',
  title: 'example',
  entries: [
    { id: '111', url: 'https://www.tiktok.com/@example/video/111', title: 'First clip', timestamp: 1735689600, duration: 65, view_count: 1200 },
    { id: '222', webpage_url: 'https://www.tiktok.com/@example/video/222', url: 'https://cdn.example.com/222', title: 'Second clip', upload_date: '20250131' },
    { id: '333', url: '/@example/video/333' },
  ],
};

function site(reply, { withYtDlp = true } = {}) {
  const dir = tempDir('exo-list-');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  if (withYtDlp) fs.writeFileSync(path.join(bin, 'yt-dlp'), FAKE_YT_DLP, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'reply.json'), JSON.stringify(reply));
  const env = { PATH: bin, CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA, EXO_WATCH_GATE_MS: '0', EXO_WATCH_BACKOFF_MS: '0', FAKE_LOG: path.join(dir, 'calls.log'), FAKE_REPLY: path.join(dir, 'reply.json') };
  const calls = () => (fs.existsSync(env.FAKE_LOG) ? fs.readFileSync(env.FAKE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  const run = (args, extra = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...env, ...extra } });
  const listing = () => calls().find((call) => call.includes('--flat-playlist'));
  return { run, listing };
}

test('lists one line per entry with only the known fields, then a summary', () => {
  const { run } = site({ json: TIKTOK_PROFILE });
  const result = run(['--url', PROFILE_URL]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trimEnd().split('\n'), [
    'https://www.tiktok.com/@example/video/111 | First clip | 2025-01-01 | 0:01:05 | 1200 views',
    'https://www.tiktok.com/@example/video/222 | Second clip | 2025-01-31',
    'https://www.tiktok.com/@example/video/333',
    '3 entries from example',
  ]);
});

test('asks yt-dlp for a flat metadata listing capped at --limit and downloads nothing', () => {
  const { run, listing } = site({ json: TIKTOK_PROFILE });
  assert.equal(run(['--url', PROFILE_URL, '--limit', '2']).status, 0);
  const args = listing();
  assert.ok(args.includes('--dump-single-json'));
  assert.equal(args[args.indexOf('--playlist-end') + 1], '2');
  assert.deepEqual(args.slice(-2), ['--', PROFILE_URL]);
  assert.ok(!args.some((arg) => ['-f', '-x', '--write-subs', '--write-auto-subs'].includes(arg)));
});

test('the default limit comes from the defaults', () => {
  const { run, listing } = site({ json: TIKTOK_PROFILE });
  run(['--url', PROFILE_URL]);
  const args = listing();
  assert.equal(args[args.indexOf('--playlist-end') + 1], '20');
});

test('prints no more entries than the limit', () => {
  const { run } = site({ json: TIKTOK_PROFILE });
  const lines = run(['--url', PROFILE_URL, '--limit', '1']).stdout.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '1 entry from example');
});

test('a YouTube channel url is accepted, tabs are flattened and bare ids become watch urls', () => {
  const tabs = {
    _type: 'playlist',
    title: 'Example Channel',
    entries: [
      { _type: 'playlist', title: 'Example Channel - Videos', entries: [{ id: 'abcdefghijk', title: 'Long one', duration: 3700, view_count: 5 }] },
      { _type: 'playlist', title: 'Example Channel - Shorts', entries: [{ id: 'lmnopqrstuv', url: 'https://www.youtube.com/shorts/lmnopqrstuv', title: 'Short one' }] },
    ],
  };
  const { run } = site({ json: tabs });
  const result = run(['--url', 'https://www.youtube.com/@example']);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trimEnd().split('\n'), [
    'https://www.youtube.com/watch?v=abcdefghijk | Long one | 1:01:40 | 5 views',
    'https://www.youtube.com/shorts/lmnopqrstuv | Short one',
    '2 entries from Example Channel',
  ]);
});

test('no entries exits 1 with a reason', () => {
  const { run } = site({ json: { _type: 'playlist', title: 'empty', entries: [] } });
  const result = run(['--url', PROFILE_URL]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /no entries/);
});

test('a yt-dlp error exits 1 with its last stderr line', () => {
  const { run } = site({ error: 'ERROR: Unable to extract user' });
  const result = run(['--url', PROFILE_URL]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /list failed: ERROR: Unable to extract user/);
});

test('a 429 from yt-dlp exits 75 with the rate-limited line, a 403 exits 1', () => {
  const limited = site({ error: 'ERROR: HTTP Error 429: Too Many Requests' }).run(['--url', PROFILE_URL]);
  assert.equal(limited.status, 75);
  assert.match(limited.stderr, /rate-limited, retry later/);
  const refused = site({ error: 'ERROR: HTTP Error 403: Forbidden' }).run(['--url', PROFILE_URL]);
  assert.equal(refused.status, 1);
});

test('a yt-dlp that outlasts its wait is reported with the wait', () => {
  const { run } = site({ hang: true, json: TIKTOK_PROFILE });
  const result = run(['--url', PROFILE_URL], { EXO_WATCH_YTDLP_MS: '300' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not finish within 0\.3 s/);
});

test('without yt-dlp on PATH it prints a missing tool line with the install command', () => {
  const { run } = site({ json: TIKTOK_PROFILE }, { withYtDlp: false });
  const result = run(['--url', PROFILE_URL], { EXO_YTDLP: path.join(tempDir('exo-list-none-'), 'yt-dlp') });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^https:\/\/www\.tiktok\.com\/@example: missing tool: listing a profile needs yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun$/m);
});

test('bad usage exits 2', () => {
  const { run } = site({ json: TIKTOK_PROFILE });
  const bad = [[], ['--url', 'ftp://example.com/@a'], ['--url', 'not a url'], ['--url', PROFILE_URL, '--limit', '0'], ['--url', PROFILE_URL, '--limit', 'x'], ['--bogus']];
  for (const args of bad) assert.equal(run(args).status, 2, args.join(' '));
});

test('--help prints the usage and exits 0', () => {
  const { run } = site({ json: TIKTOK_PROFILE });
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^usage: node list\.mjs --url <url>/);
});
