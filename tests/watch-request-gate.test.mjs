import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { failureLine, gateRequest, isRateLimited, isRetryable } from '../skills/watch/scripts/request-gate.mjs';
import { tempDir } from './harness.mjs';

const TIKTOK = 'https://www.tiktok.com/@example/video/7301234567890123456';
const YOUTUBE = 'https://www.youtube.com/watch?v=abc12345678';

function clock() {
  const state = { time: Date.now(), sleeps: [] };
  return {
    state,
    now: () => state.time,
    sleep: async (ms) => {
      state.sleeps.push(ms);
      state.time += ms;
    },
  };
}

function gateOptions(extra = {}) {
  const fake = clock();
  return { fake, options: { dir: tempDir('gate-'), spacingMs: 1000, jitterMs: 0, staleMs: 5000, pollMs: 10, now: fake.now, sleep: fake.sleep, random: () => 0, ...extra } };
}

test('the first request to a host does not wait', async () => {
  const { fake, options } = gateOptions();
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, []);
});

test('a second request to the same host waits out the spacing', async () => {
  const { fake, options } = gateOptions();
  await gateRequest(TIKTOK, options);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [1000]);
});

test('the wait is only what is left of the spacing', async () => {
  const { fake, options } = gateOptions();
  await gateRequest(TIKTOK, options);
  fake.state.time += 400;
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [600]);
});

test('jitter adds a random share of the jitter window to the spacing', async () => {
  const { fake, options } = gateOptions({ jitterMs: 500, random: () => 0.5 });
  await gateRequest(TIKTOK, options);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [1250]);
});

test('another host has its own turn', async () => {
  const { fake, options } = gateOptions();
  await gateRequest(TIKTOK, options);
  await gateRequest(YOUTUBE, options);
  assert.deepEqual(fake.state.sleeps, []);
});

test('a www prefix does not make a second host', async () => {
  const { fake, options } = gateOptions();
  await gateRequest('https://tiktok.com/@example', options);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [1000]);
});

test('a value without a host is not gated and does not throw', async () => {
  const { fake, options } = gateOptions();
  await gateRequest('--version', options);
  await gateRequest(undefined, options);
  assert.deepEqual(fake.state.sleeps, []);
  assert.equal(fs.existsSync(options.dir) && fs.readdirSync(options.dir).length, 0);
});

test('a last request stamped in the future waits no longer than the spacing', async () => {
  const { fake, options } = gateOptions();
  fs.writeFileSync(path.join(options.dir, 'tiktok.com.last'), String(fake.state.time + 3_600_000));
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [1000]);
});

test('a held lock is waited for, then the turn is taken', async () => {
  const { fake, options } = gateOptions();
  const lock = path.join(options.dir, 'tiktok.com.lock');
  fs.writeFileSync(lock, '');
  setTimeout(() => fs.rmSync(lock), 40);
  await gateRequest(TIKTOK, options);
  assert.equal(fs.existsSync(lock), false);
});

test('a lock older than the stale timeout is taken over', async () => {
  const { fake, options } = gateOptions();
  const lock = path.join(options.dir, 'tiktok.com.lock');
  fs.writeFileSync(lock, '');
  const old = new Date(fake.state.time - 60_000);
  fs.utimesSync(lock, old, old);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, []);
  assert.equal(fs.existsSync(lock), false);
});

test('the lock is released when the wait fails', async () => {
  const { options } = gateOptions();
  await gateRequest(TIKTOK, options);
  const sleep = async () => {
    throw new Error('interrupted');
  };
  await assert.rejects(gateRequest(TIKTOK, { ...options, sleep }), /interrupted/);
  assert.equal(fs.existsSync(path.join(options.dir, 'tiktok.com.lock')), false);
});

test('the spacing default comes from EXO_WATCH_GATE_MS and the cache folder from CLAUDE_PLUGIN_DATA', async () => {
  const data = tempDir('gate-data-');
  const fake = clock();
  const env = { CLAUDE_PLUGIN_DATA: data, EXO_WATCH_GATE_MS: '700' };
  const options = { env, jitterMs: 0, now: fake.now, sleep: fake.sleep, random: () => 0 };
  await gateRequest(TIKTOK, options);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, [700]);
  assert.ok(fs.existsSync(path.join(data, 'gate', 'tiktok.com.last')));
});

test('EXO_WATCH_GATE_MS=0 switches the pacing and its jitter off', async () => {
  const fake = clock();
  const env = { CLAUDE_PLUGIN_DATA: tempDir('gate-data-'), EXO_WATCH_GATE_MS: '0' };
  const options = { env, now: fake.now, sleep: fake.sleep, random: () => 0.99 };
  await gateRequest(TIKTOK, options);
  await gateRequest(TIKTOK, options);
  assert.deepEqual(fake.state.sleeps, []);
});

test('without CLAUDE_PLUGIN_DATA the cache folder is under the home cache', async () => {
  const home = tempDir('gate-home-');
  await gateRequest(TIKTOK, { env: {}, home, spacingMs: 1, jitterMs: 0 });
  assert.ok(fs.existsSync(path.join(home, '.cache', 'exo', 'gate', 'tiktok.com.last')));
});

const CHILD = `
import { gateRequest } from ${JSON.stringify(path.resolve('skills/watch/scripts/request-gate.mjs'))};
await gateRequest(process.argv[2], { dir: process.argv[3], spacingMs: 300, jitterMs: 0 });
console.log(Date.now());
`;

function runChild(file, url, dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, url, dir], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(`child exited ${code}`))));
  });
}

test('processes started together take their turns at least the spacing apart', async () => {
  const dir = tempDir('gate-procs-');
  const file = path.join(tempDir('gate-child-'), 'child.mjs');
  fs.writeFileSync(file, CHILD);
  const stamps = (await Promise.all([1, 2, 3].map(() => runChild(file, TIKTOK, dir)))).sort((a, b) => a - b);
  assert.ok(stamps[1] - stamps[0] >= 290, `gap ${stamps[1] - stamps[0]}`);
  assert.ok(stamps[2] - stamps[1] >= 290, `gap ${stamps[2] - stamps[1]}`);
});

test('failureLine names a throttled fetch as rate-limited and a refused or failing one apart', () => {
  const failure = (stderr) => failureLine({ stderr, error: new Error('Command failed') });
  assert.equal(failure('ERROR: HTTP Error 429: Too Many Requests'), 'rate-limited, retry later');
  const others = ['ERROR: unable to download video data: HTTP Error 403: Forbidden', 'ERROR: HTTP Error 503: Service Unavailable', 'ERROR: [TikTok] 1: Unable to download webpage: HTTP Error 502: Bad Gateway'];
  for (const stderr of others) assert.equal(failure(stderr), 'refused or failing server, retry later');
});

test('failureLine names a private or removed video', () => {
  const lines = ['ERROR: [youtube] abc: Private video. Sign in if you have been granted access', 'ERROR: [TikTok] 1: This video has been removed', 'ERROR: [youtube] abc: Video unavailable', 'ERROR: HTTP Error 404: Not Found', 'ERROR: [TikTok] 1: Video not available, status code 10204'];
  for (const stderr of lines) assert.equal(failureLine({ stderr }), 'private/removed');
});

test('failureLine gives any other reason as the last stderr line, cut short', () => {
  assert.equal(failureLine({ stderr: 'WARNING: noise\nERROR: Unable to extract user\n' }), 'ERROR: Unable to extract user');
  assert.equal(failureLine({ stderr: '', error: new Error('spawn broke') }), 'spawn broke');
  assert.equal(failureLine({ stderr: '' }), 'no error text');
  assert.equal(failureLine(new Error('plain failure')), 'plain failure');
  assert.equal(failureLine('ERROR: as text'), 'ERROR: as text');
  assert.ok(failureLine({ stderr: `ERROR: ${'x'.repeat(500)}` }).length <= 160);
});

test('only a refused, throttled or server-failed fetch is retried', () => {
  const failed = (stderr, extra = {}) => ({ error: Object.assign(new Error('x'), extra), stderr });
  assert.equal(isRetryable(failed('ERROR: HTTP Error 403: Forbidden')), true);
  assert.equal(isRetryable(failed('ERROR: HTTP Error 429: Too Many Requests')), true);
  assert.equal(isRetryable(failed('ERROR: HTTP Error 500: Internal Server Error')), true);
  assert.equal(isRetryable(failed('ERROR: HTTP Error 404: Not Found')), false);
  assert.equal(isRetryable(failed('ERROR: Private video')), false);
  assert.equal(isRetryable({ error: null, stderr: 'HTTP Error 403: Forbidden' }), false);
  assert.equal(isRetryable(failed('HTTP Error 403', { killed: true })), false);
});

test('only a 429 is rate-limited for the breaker', () => {
  assert.equal(isRateLimited({ stderr: 'ERROR: HTTP Error 429: Too Many Requests' }), true);
  assert.equal(isRateLimited('ERROR: Too Many Requests'), true);
  assert.equal(isRateLimited({ stderr: 'ERROR: HTTP Error 403: Forbidden' }), false);
  assert.equal(isRateLimited({ stderr: 'ERROR: HTTP Error 503: Service Unavailable' }), false);
  assert.equal(isRateLimited({ stderr: 'There are no subtitles' }), false);
});
