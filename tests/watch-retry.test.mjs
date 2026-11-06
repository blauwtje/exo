import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { runYtDlpWithRuntime, ytDlpReason } from '../skills/watch/scripts/ytdlp.mjs';
import { tempDir } from './harness.mjs';

const URL_ = 'https://www.tiktok.com/@example/video/7301234567890123456';
const FAKE = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
fs.appendFileSync(process.env.FAKE_LOG + '.at', Date.now() + '\\n');
const calls = fs.readFileSync(process.env.FAKE_LOG, 'utf8').split('\\n').filter(Boolean).length;
const failures = JSON.parse(process.env.FAKE_FAILURES);
const failure = failures[Math.min(calls, failures.length) - 1];
if (failure) { console.error(failure); process.exit(1); }
console.log('{"id":"1"}');
`;

async function withFake(failures, work) {
  const dir = tempDir('retry-');
  const bin = path.join(dir, 'yt-dlp');
  fs.writeFileSync(bin, FAKE, { mode: 0o755 });
  const log = path.join(dir, 'calls.log');
  const names = ['EXO_YTDLP', 'FAKE_LOG', 'FAKE_FAILURES'];
  const saved = names.map((name) => process.env[name]);
  Object.assign(process.env, { EXO_YTDLP: bin, FAKE_LOG: log, FAKE_FAILURES: JSON.stringify(failures) });
  const calls = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  try {
    return await work(calls);
  } finally {
    names.forEach((name, index) => (saved[index] === undefined ? delete process.env[name] : (process.env[name] = saved[index])));
  }
}

const FORBIDDEN = 'ERROR: unable to download video data: HTTP Error 403: Forbidden';

test('a 403 is retried and the later success is returned', async () => {
  await withFake([FORBIDDEN, FORBIDDEN, null], async (calls) => {
    const run = await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
    assert.equal(run.error, null);
    assert.equal(calls().length, 3);
  });
});

test('three refused tries end in the rate-limited failure line', async () => {
  await withFake([FORBIDDEN], async (calls) => {
    const run = await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
    assert.ok(run.error);
    assert.equal(calls().length, 3);
    assert.equal(ytDlpReason(run, { ytDlpMs: 5000 }), 'rate-limited, retry later');
  });
});

test('429 and 5xx are retried too', async () => {
  for (const line of ['ERROR: HTTP Error 429', 'ERROR: HTTP Error 503: Service Unavailable', 'ERROR: HTTP Error 500', 'ERROR: Too Many Requests']) {
    await withFake([line, null], async (calls) => {
      const run = await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
      assert.equal(run.error, null);
      assert.equal(calls().length, 2);
    });
  }
});

test('a removed video is tried once and reads as private/removed', async () => {
  await withFake(['ERROR: [TikTok] 1: This video has been removed'], async (calls) => {
    const run = await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
    assert.equal(calls().length, 1);
    assert.equal(ytDlpReason(run, { ytDlpMs: 5000 }), 'private/removed');
  });
});

test('any other failure is tried once and keeps its own line', async () => {
  await withFake(['ERROR: Unable to extract user'], async (calls) => {
    const run = await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
    assert.equal(calls().length, 1);
    assert.equal(ytDlpReason(run, { ytDlpMs: 5000 }), 'ERROR: Unable to extract user');
  });
});

test('every yt-dlp call for a url takes its turn at the host gate', async () => {
  await withFake([null], async () => {
    await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
    assert.ok(fs.existsSync(path.join(process.env.CLAUDE_PLUGIN_DATA, 'gate', 'tiktok.com.last')));
  });
});

test('the wait before each retry starts at EXO_WATCH_BACKOFF_MS and doubles', async () => {
  const saved = process.env.EXO_WATCH_BACKOFF_MS;
  process.env.EXO_WATCH_BACKOFF_MS = '150';
  try {
    await withFake([FORBIDDEN], async () => {
      await runYtDlpWithRuntime(['-J', '--', URL_], 5000);
      const times = fs.readFileSync(`${process.env.FAKE_LOG}.at`, 'utf8').split('\n').filter(Boolean).map(Number);
      const [first, second] = [times[1] - times[0], times[2] - times[1]];
      assert.ok(first >= 140, `first wait ${first} ms`);
      assert.ok(second - first >= 100, `second wait ${second} ms after ${first} ms`);
    });
  } finally {
    if (saved === undefined) delete process.env.EXO_WATCH_BACKOFF_MS;
    else process.env.EXO_WATCH_BACKOFF_MS = saved;
  }
});
