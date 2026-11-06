import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { decoderPath, toWav, extractFrames } from '../skills/watch/scripts/decoder.mjs';
import { tempDir } from './harness.mjs';

const PINNED = {
  'darwin-arm64': 'sha512-hYqTiP63mXz7wSQfuqfFwfLOfwwFChUedeCVKkBtl/cliaTM7/ePI9bVzfZ2c+dWu3TqCwLDRWNSJ5pqZl8otA==',
  'win32-x64': 'sha512-Drt5u2vzDnIONf4ZEkKtFlbvwj6rI3kxw1Ck9fpudmtgaZIHD4ucsWB2lCZBXRxJgXR+2IMSti+4rtM4C4rXgg==',
};

function sandbox() {
  const dir = fs.realpathSync(tempDir('decoder-'));
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty);
  const data = path.join(dir, 'data');
  return { dir, empty, home: path.join(dir, 'home'), data, env: { PATH: empty, CLAUDE_PLUGIN_DATA: data } };
}

function fakeInstaller({ integrity, lockKey = (name) => `node_modules/${name}` } = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    const prefix = args[args.indexOf('--prefix') + 1];
    const spec = args.find((arg) => arg.startsWith('@ffmpeg-installer/'));
    const name = spec.slice(0, spec.lastIndexOf('@'));
    const folder = path.join(prefix, 'node_modules', name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, name.includes('win32') ? 'ffmpeg.exe' : 'ffmpeg'), 'binary');
    const recorded = integrity ?? PINNED[name.replace('@ffmpeg-installer/', '')];
    fs.writeFileSync(path.join(prefix, 'package-lock.json'), JSON.stringify({ packages: { [lockKey(name)]: { integrity: recorded } } }));
    return { error: null, stdout: '', stderr: '' };
  };
  return { run, calls };
}

function envWithFfmpeg(site) {
  const bin = path.join(site.dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'ffmpeg'), '#!/bin/sh\n', { mode: 0o755 });
  return { ...site.env, PATH: bin };
}

function recorder({ fail = false } = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (fail) return { error: new Error('boom'), stdout: '', stderr: 'Invalid data\n' };
    fs.writeFileSync(args.at(-1), 'out');
    return { error: null, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('ffmpeg on PATH wins and nothing is installed', async () => {
  const site = sandbox();
  const installer = fakeInstaller();
  const found = await decoderPath({ env: envWithFfmpeg(site), platform: 'darwin', arch: 'arm64', home: site.home, run: installer.run });
  assert.equal(found, 'ffmpeg');
  assert.equal(installer.calls.length, 0);
});

test('without ffmpeg the pinned package installs once into the plugin cache', async () => {
  const site = sandbox();
  const installer = fakeInstaller();
  const options = { env: site.env, platform: 'darwin', arch: 'arm64', home: site.home, run: installer.run };
  const first = await decoderPath(options);
  const prefix = path.join(site.data, 'npm', 'ffmpeg');
  assert.equal(first, path.join(prefix, 'node_modules', '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'));
  const [command, ...args] = installer.calls[0];
  assert.match(command, /^npm(\.cmd)?$/);
  assert.equal(args[0], 'install');
  assert.equal(args[args.indexOf('--prefix') + 1], prefix);
  assert.ok(args.includes('@ffmpeg-installer/darwin-arm64@4.1.5'));
  assert.equal(await decoderPath(options), first);
  assert.equal(installer.calls.length, 1);
});

test('a lock entry npm keyed by a relative path through a symlinked prefix still proves the pin', async () => {
  const site = sandbox();
  const installer = fakeInstaller({ lockKey: (name) => `../../../../private/tmp/data/npm/ffmpeg/node_modules/${name}` });
  const binary = await decoderPath({ env: site.env, platform: 'darwin', arch: 'arm64', home: site.home, run: installer.run });
  assert.ok(fs.existsSync(binary));
});

test('the cache falls back to ~/.cache/exo without CLAUDE_PLUGIN_DATA', async () => {
  const site = sandbox();
  const installer = fakeInstaller();
  const found = await decoderPath({ env: { PATH: site.empty }, platform: 'darwin', arch: 'arm64', home: site.home, run: installer.run });
  assert.ok(found.startsWith(path.join(site.home, '.cache', 'exo', 'npm', 'ffmpeg')));
});

test('windows on arm installs the x64 package', async () => {
  const site = sandbox();
  const installer = fakeInstaller();
  const found = await decoderPath({ env: site.env, platform: 'win32', arch: 'arm64', home: site.home, run: installer.run });
  assert.ok(installer.calls[0].includes('@ffmpeg-installer/win32-x64@4.1.0'));
  assert.ok(found.endsWith(path.join('win32-x64', 'ffmpeg.exe')));
});

test('an integrity that differs from the pin removes the package and rejects', async () => {
  const site = sandbox();
  const installer = fakeInstaller({ integrity: 'sha512-other' });
  await assert.rejects(decoderPath({ env: site.env, platform: 'darwin', arch: 'arm64', home: site.home, run: installer.run }), /integrity/);
  assert.ok(!fs.existsSync(path.join(site.data, 'npm', 'ffmpeg', 'node_modules', '@ffmpeg-installer')));
});

test('a failed install and an unsupported platform reject with the reason', async () => {
  const site = sandbox();
  const run = async () => ({ error: new Error('x'), stdout: '', stderr: 'npm ERR! network\n' });
  await assert.rejects(decoderPath({ env: site.env, platform: 'darwin', arch: 'arm64', home: site.home, run }), /network/);
  await assert.rejects(decoderPath({ env: site.env, platform: 'freebsd', arch: 'x64', home: site.home, run }), /freebsd-x64/);
});

test('toWav converts to a 16 kHz mono wav beside the input', async () => {
  const site = sandbox();
  const recording = recorder();
  const input = path.join(site.dir, 'audio.m4a');
  fs.writeFileSync(input, 'in');
  const wav = await toWav(input, { env: envWithFfmpeg(site), home: site.home, run: recording.run });
  assert.equal(wav, path.join(site.dir, 'audio.wav'));
  assert.ok(fs.existsSync(wav));
  assert.equal(recording.calls[0][0], 'ffmpeg');
  assert.ok(recording.calls[0].join(' ').includes(`-i ${input} -ar 16000 -ac 1 -c:a pcm_s16le`));
});

test('toWav never overwrites a wav input and rejects with the ffmpeg reason', async () => {
  const site = sandbox();
  const input = path.join(site.dir, 'audio.wav');
  fs.writeFileSync(input, 'in');
  const wav = await toWav(input, { env: envWithFfmpeg(site), home: site.home, run: recorder().run });
  assert.notEqual(wav, input);
  await assert.rejects(toWav(input, { env: envWithFfmpeg(site), home: site.home, run: recorder({ fail: true }).run }), /Invalid data/);
});

test('extractFrames writes six evenly spaced jpg frames of at most 640 px', async () => {
  const site = sandbox();
  const recording = recorder();
  const video = path.join(site.dir, 'video.mp4');
  fs.writeFileSync(video, 'v');
  const folder = await extractFrames(video, site.dir, 120, { env: envWithFfmpeg(site), home: site.home, run: recording.run });
  assert.equal(folder, path.join(site.dir, 'frames'));
  assert.deepEqual(fs.readdirSync(folder).sort(), ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg', '06.jpg']);
  const seeks = recording.calls.map((args) => Number(args[args.indexOf('-ss') + 1])).sort((a, b) => a - b);
  assert.deepEqual(seeks, [10, 30, 50, 70, 90, 110]);
  const first = recording.calls.find((args) => args.at(-1).endsWith('01.jpg'));
  assert.ok(first.join(' ').includes('-q:v 5'));
  assert.ok(first.some((arg) => arg.startsWith('scale=640:640')));
});

test('extractFrames leaves no frames folder when a frame fails', async () => {
  const site = sandbox();
  const run = recorder({ fail: true }).run;
  await assert.rejects(extractFrames(path.join(site.dir, 'v.mp4'), site.dir, 60, { env: envWithFfmpeg(site), home: site.home, run }), /Invalid data/);
  assert.ok(!fs.existsSync(path.join(site.dir, 'frames')));
});
