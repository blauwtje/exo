import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assetFor, resolveYtDlp } from '../skills/watch/scripts/ytdlp-binary.mjs';
import { ytDlpAvailable, ytDlpNeed, runYtDlpWithRuntime } from '../skills/watch/scripts/ytdlp.mjs';
import { watchOne } from '../skills/watch/scripts/watch.mjs';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
const INFO = { id: '7301234567890123456', extractor_key: 'TikTok', title: 'Quiet', duration: 6, subtitles: {}, automatic_captions: {} };
const FAKE_BINARY = `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args.includes('--version')) console.log('2099.01.01');\nif (args.includes('-J')) console.log(${JSON.stringify(JSON.stringify(INFO))});\n`;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function releaseServer({ asset, binary = FAKE_BINARY, sums, status = 200 }) {
  const calls = [];
  const listed = sums ?? `${sha256(binary)}  ${asset}\n${'0'.repeat(64)}  other_asset\n`;
  const fetchFn = async (url) => {
    calls.push(String(url));
    if (status !== 200) return new Response('', { status });
    const body = String(url) === `${RELEASE}SHA2-256SUMS` ? listed : binary;
    return new Response(body, { status: 200 });
  };
  return { fetchFn, calls };
}

function sandbox() {
  const dir = fs.realpathSync(tempDir('ytdlp-binary-'));
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  const data = path.join(dir, 'data');
  return { dir, empty, data, cache: path.join(data, 'bin'), env: { PATH: empty, CLAUDE_PLUGIN_DATA: data } };
}

const mac = { platform: 'darwin', arch: 'arm64', fetchMs: 5000 };

test('the release asset follows the platform and architecture', () => {
  assert.equal(assetFor('darwin', 'arm64'), 'yt-dlp_macos');
  assert.equal(assetFor('darwin', 'x64'), 'yt-dlp_macos');
  assert.equal(assetFor('linux', 'x64'), 'yt-dlp_linux');
  assert.equal(assetFor('linux', 'arm64'), 'yt-dlp_linux_aarch64');
  assert.equal(assetFor('win32', 'x64'), 'yt-dlp.exe');
  assert.equal(assetFor('linux', 'riscv64'), null);
  assert.equal(assetFor('freebsd', 'x64'), null);
});

test('a yt-dlp on PATH wins and nothing is fetched', async () => {
  const { dir, env } = sandbox();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), '#!/bin/sh\n', { mode: 0o755 });
  const server = releaseServer({ asset: 'yt-dlp_macos' });
  const result = await resolveYtDlp({ ...mac, env: { ...env, PATH: bin }, fetchFn: server.fetchFn });
  assert.deepEqual(result, { command: 'yt-dlp' });
  assert.deepEqual(server.calls, []);
});

test('EXO_YTDLP names the binary and skips PATH and the fetch', async () => {
  const { env } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_macos' });
  const result = await resolveYtDlp({ ...mac, env: { ...env, EXO_YTDLP: '/opt/tools/yt-dlp' }, fetchFn: server.fetchFn });
  assert.deepEqual(result, { command: '/opt/tools/yt-dlp' });
  assert.deepEqual(server.calls, []);
});

test('a missing yt-dlp is fetched, verified, cached executable and reused', async () => {
  const { env, cache } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_macos' });
  const first = await resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn });
  const target = path.join(cache, 'yt-dlp');
  assert.deepEqual(first, { command: target });
  assert.deepEqual(server.calls, [`${RELEASE}SHA2-256SUMS`, `${RELEASE}yt-dlp_macos`]);
  assert.equal(fs.readFileSync(target, 'utf8'), FAKE_BINARY);
  assert.equal(fs.statSync(target).mode & 0o777, 0o755);
  assert.deepEqual(fs.readdirSync(cache), ['yt-dlp']);
  const second = await resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn });
  assert.deepEqual(second, { command: target });
  assert.equal(server.calls.length, 2);
});

test('the cache falls back to the home directory when no plugin data folder is set', async () => {
  const { dir } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_linux' });
  const result = await resolveYtDlp({ platform: 'linux', arch: 'x64', fetchMs: 5000, env: { PATH: '' }, home: dir, fetchFn: server.fetchFn });
  assert.deepEqual(result, { command: path.join(dir, '.cache', 'exo', 'bin', 'yt-dlp') });
});

test('concurrent callers fetch once', async () => {
  const { env } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_macos' });
  const results = await Promise.all([1, 2, 3].map(() => resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn })));
  assert.equal(new Set(results.map((result) => result.command)).size, 1);
  assert.equal(server.calls.length, 2);
});

test('a checksum mismatch writes nothing and names the reason', async () => {
  const { env, cache } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_macos', sums: `${'a'.repeat(64)}  yt-dlp_macos\n` });
  const result = await resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn });
  assert.equal(result.command, null);
  assert.match(result.reason, /checksum mismatch for yt-dlp_macos/);
  assert.ok(!fs.existsSync(cache) || fs.readdirSync(cache).length === 0);
});

test('an asset missing from the checksum file is refused', async () => {
  const { env, cache } = sandbox();
  const server = releaseServer({ asset: 'yt-dlp_macos', sums: `${'a'.repeat(64)}  other_asset\n` });
  const result = await resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn });
  assert.equal(result.command, null);
  assert.match(result.reason, /SHA2-256SUMS lists no yt-dlp_macos/);
  assert.ok(!fs.existsSync(cache) || fs.readdirSync(cache).length === 0);
});

test('a failed fetch leaves nothing behind and keeps other files in the cache', async () => {
  const { env, cache } = sandbox();
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'keep.txt'), 'mine');
  const server = releaseServer({ asset: 'yt-dlp_macos', status: 404 });
  const result = await resolveYtDlp({ ...mac, env, fetchFn: server.fetchFn });
  assert.equal(result.command, null);
  assert.match(result.reason, /answered 404/);
  assert.deepEqual(fs.readdirSync(cache), ['keep.txt']);
});

test('a network error names its code', async () => {
  const { env } = sandbox();
  const fetchFn = async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); };
  const result = await resolveYtDlp({ ...mac, env, fetchFn });
  assert.deepEqual(result, { command: null, reason: 'ENOTFOUND' });
});

test('an unsupported platform is not provisioned and has no reason', async () => {
  const { env } = sandbox();
  const server = releaseServer({ asset: 'x' });
  const result = await resolveYtDlp({ platform: 'freebsd', arch: 'x64', env, fetchFn: server.fetchFn });
  assert.deepEqual(result, { command: null });
  assert.deepEqual(server.calls, []);
});

const runnable = !['win32'].includes(process.platform) && assetFor(process.platform, process.arch) !== null;

async function withRelease(work, { status = 200 } = {}) {
  const { env, cache } = sandbox();
  const server = releaseServer({ asset: assetFor(process.platform, process.arch), status });
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  Object.assign(process.env, env);
  delete process.env.EXO_YTDLP;
  globalThis.fetch = server.fetchFn;
  try {
    return await work({ server, cache });
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of ['PATH', 'CLAUDE_PLUGIN_DATA']) process.env[key] = saved[key];
  }
}

test('the yt-dlp calls run the fetched binary', { skip: !runnable }, async () => {
  await withRelease(async ({ server, cache }) => {
    assert.equal(await ytDlpAvailable(5000), true);
    const run = await runYtDlpWithRuntime(['--version'], 5000);
    assert.equal(run.error, null);
    assert.equal(run.stdout.trim(), '2099.01.01');
    assert.equal(await ytDlpNeed(), null);
    assert.equal(server.calls.length, 2);
    assert.deepEqual(fs.readdirSync(cache), ['yt-dlp']);
  });
});

test('a video url is read through the fetched yt-dlp, then fetches the audio', { skip: !runnable }, async () => {
  await withRelease(async ({ server }) => {
    const options = { out: tempDir('ytdlp-out-'), chunkMinutes: 30, stampSeconds: 45, fetchMs: 5000, ytDlpMs: 5000, transcribeMs: 5000 };
    const result = await watchOne('https://www.tiktok.com/@u/video/7301234567890123456', options);
    assert.match(result.failure, /no transcript: the video has no captions, and audio download failed: /);
    assert.equal(server.calls.length, 2);
  });
});

test('a failed fetch ends as a missing tool with the reason and the manual install command', { skip: !runnable }, async () => {
  await withRelease(async () => {
    const options = { out: tempDir('ytdlp-out-'), chunkMinutes: 30, stampSeconds: 45, fetchMs: 5000, ytDlpMs: 5000, transcribeMs: 5000 };
    const result = await watchOne('https://www.tiktok.com/@u/video/7301234567890123456', options);
    assert.match(result.failure, /: missing tool: reading www\.tiktok\.com videos needs yt-dlp on PATH \(fetching the release binary failed: .*answered 503\); install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun$/);
  }, { status: 503 });
});
