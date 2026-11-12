import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { transcribe } from '../skills/watch/scripts/speech.mjs';
import { runTool } from '../skills/watch/scripts/run-tool.mjs';
import { tempDir } from './harness.mjs';

const MODEL_BYTES = Buffer.from('fake ggml model bytes');
const PIN = {
  file: 'ggml-base-q5_1.bin',
  url: 'https://models.example.com/ggml-base-q5_1.bin',
  size: MODEL_BYTES.length,
  sha256: createHash('sha256').update(MODEL_BYTES).digest('hex'),
};
const SELECTOR = 'bestaudio[format_note*=original]/bestaudio[ext=mp3]/bestaudio[ext=wav]/bestaudio[ext=flac]/bestaudio/best';
const FAKE_PACKAGE = `
exports.initWhisper = async ({ filePath }) => ({
  transcribeFile: (file, options) => ({
    promise: Promise.resolve({
      language: 'nl',
      segments: [
        { text: ' hallo wereld', t0: 0, t1: 1500 },
        { text: JSON.stringify({ filePath, file, options }), t0: 1500, t1: 3600000 },
      ],
    }),
  }),
  release: async () => {},
});
`;

function installFakePackage(prefix) {
  const folder = path.join(prefix, 'node_modules', '@fugood', 'whisper.node');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: '@fugood/whisper.node', version: '1.1.3', main: 'index.js' }));
  fs.writeFileSync(path.join(folder, 'index.js'), FAKE_PACKAGE);
}

function site({ tools = [], ext = 'mp3', body = MODEL_BYTES, npmFails = false } = {}) {
  const dir = fs.realpathSync(tempDir('provision-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const tool of tools) fs.writeFileSync(path.join(bin, tool), '', { mode: 0o755 });
  const cache = path.join(dir, 'cache');
  const calls = { npm: [], fetch: [], download: [], engine: [], toWav: [] };
  const fetchFn = async (url) => {
    calls.fetch.push(String(url));
    return new Response(body, { status: 200 });
  };
  const runYtDlp = async (args) => {
    calls.download.push(args);
    fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], `audio.${ext}`), 'audio');
    return { error: null, stdout: '', stderr: '' };
  };
  const run = async (command, args, timeout) => {
    if (command === 'npm') {
      calls.npm.push(args);
      if (npmFails) return { error: new Error('failed'), stdout: '', stderr: 'npm ERR! network offline\n' };
      installFakePackage(args[args.indexOf('--prefix') + 1]);
      return { error: null, stdout: '', stderr: '' };
    }
    if (command === process.execPath) return runTool(command, args, timeout);
    calls.engine.push([command, ...args]);
    const target = command === 'whisper' ? path.join(args[args.indexOf('--output_dir') + 1], 'audio.vtt') : `${args[args.indexOf('-of') + 1]}.vtt`;
    fs.writeFileSync(target, 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nfrom the cli\n');
    return { error: null, stdout: '', stderr: '' };
  };
  const toWav = async (input) => {
    calls.toWav.push(input);
    const wav = path.join(path.dirname(input), 'audio.wav');
    fs.writeFileSync(wav, 'wav');
    return wav;
  };
  const options = {
    env: { CLAUDE_PLUGIN_DATA: cache, PATH: bin },
    home: dir,
    ytDlpNeed: async () => null,
    ytDlpReason: () => 'download denied',
    ytDlpMs: 1000,
    transcribeMs: 20000,
    fetchFn,
    modelPin: PIN,
    runYtDlp,
    runTool: run,
    toWav,
  };
  const folder = path.join(dir, 'out', 'video');
  return { dir, cache, calls, options, folder, run: (extra = {}) => transcribe('https://example.com/v', folder, { ...options, ...extra }) };
}

test('without whisper-cli or whisper the whisper.node route installs itself, downloads the model and detects the language', async () => {
  const s = site();
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.equal(result.engine, 'whisper.node');
  assert.equal(result.language, 'nl');
  const install = s.calls.npm[0];
  assert.equal(install[0], 'install');
  assert.equal(install[install.indexOf('--prefix') + 1], path.join(s.cache, 'npm', 'whisper'));
  assert.ok(install.includes('@fugood/whisper.node@1.1.3'));
  const model = path.join(s.cache, 'models', PIN.file);
  assert.deepEqual(fs.readFileSync(model), MODEL_BYTES);
  assert.deepEqual(fs.readdirSync(path.join(s.cache, 'models')), [PIN.file]);
  const vtt = fs.readFileSync(result.vtt, 'utf8');
  assert.match(vtt, /00:00:00\.000 --> 00:00:01\.500\nhallo wereld/);
  assert.match(vtt, /00:00:01\.500 --> 01:00:00\.000\n/);
  const heard = JSON.parse(vtt.split('\n').find((line) => line.startsWith('{')));
  assert.equal(heard.filePath, model);
  assert.deepEqual(heard.options, { language: 'auto' });
});

test('--lang is passed to whisper.node as its two-letter code and auto otherwise', async () => {
  const s = site();
  const result = await s.run({ lang: 'pt-BR' });
  const heard = JSON.parse(fs.readFileSync(result.vtt, 'utf8').split('\n').find((line) => line.startsWith('{')));
  assert.deepEqual(heard.options, { language: 'pt' });
});

test('a second video neither installs nor downloads again', async () => {
  const s = site();
  await s.run();
  await s.run();
  assert.equal(s.calls.npm.length, 1);
  assert.equal(s.calls.fetch.filter((url) => url === PIN.url).length, 1);
});

test('a model whose checksum or size differs is removed as its own .tmp and fails the video', async () => {
  const cases = [Buffer.from('other model bytes!!!!'), Buffer.from('short')];
  for (const body of cases) {
    const s = site({ body });
    const models = path.join(s.cache, 'models');
    fs.mkdirSync(models, { recursive: true });
    fs.writeFileSync(path.join(models, 'keep.bin'), 'keep');
    const result = await s.run();
    assert.match(result.failure, /^downloading the whisper model failed: /);
    assert.deepEqual(fs.readdirSync(models), ['keep.bin']);
  }
});

test('a failed npm install fails the video with its last line and no missing-tool wording', async () => {
  const s = site({ npmFails: true });
  const result = await s.run();
  assert.equal(result.failure, 'installing whisper.node failed: npm ERR! network offline');
  assert.equal(result.missing, undefined);
  assert.equal(s.calls.fetch.length, 0);
});

test('whisper-cli without --model uses the cached default model', async () => {
  const s = site({ tools: ['whisper-cli', 'whisper'] });
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.equal(result.engine, 'whisper.cpp');
  const [command, ...args] = s.calls.engine[0];
  assert.equal(command, 'whisper-cli');
  assert.equal(args[args.indexOf('-m') + 1], path.join(s.cache, 'models', PIN.file));
  assert.equal(args[args.indexOf('-l') + 1], 'auto');
  assert.equal(s.calls.npm.length, 0);
});

test('whisper-cli keeps an existing --model file and whisper follows when the cli is absent', async () => {
  const withCli = site({ tools: ['whisper-cli'] });
  const model = path.join(withCli.dir, 'own.bin');
  fs.writeFileSync(model, 'own');
  await withCli.run({ model });
  assert.equal(withCli.calls.engine[0][withCli.calls.engine[0].indexOf('-m') + 1], model);
  assert.equal(withCli.calls.fetch.length, 0);

  const withWhisper = site({ tools: ['whisper'] });
  const result = await withWhisper.run();
  assert.equal(result.engine, 'whisper');
  assert.equal(withWhisper.calls.engine[0][0], 'whisper');
});

test('the audio is fetched with the lossless-friendly selector', async () => {
  const s = site();
  await s.run();
  const args = s.calls.download[0];
  assert.equal(args[args.indexOf('-f') + 1], SELECTOR);
});

test('mp3, wav and flac reach the engine as fetched and other formats go through toWav', async () => {
  for (const ext of ['mp3', 'wav', 'flac']) {
    const s = site({ ext });
    const result = await s.run();
    assert.equal(result.failure, undefined);
    assert.deepEqual(s.calls.toWav, []);
    const heard = JSON.parse(fs.readFileSync(result.vtt, 'utf8').split('\n').find((line) => line.startsWith('{')));
    assert.equal(heard.file, path.join(s.folder, `audio.${ext}`));
  }
  const s = site({ ext: 'm4a' });
  const result = await s.run();
  assert.deepEqual(s.calls.toWav, [path.join(s.folder, 'audio.m4a')]);
  const heard = JSON.parse(fs.readFileSync(result.vtt, 'utf8').split('\n').find((line) => line.startsWith('{')));
  assert.equal(heard.file, path.join(s.folder, 'audio.wav'));
  assert.deepEqual(fs.readdirSync(s.folder).filter((name) => name.startsWith('audio.')), []);
});

test('a failing toWav fails the video with its message', async () => {
  const s = site({ ext: 'm4a' });
  const result = await s.run({ toWav: async () => { throw new Error('cannot decode'); } });
  assert.equal(result.failure, 'converting the audio failed: cannot decode');
});

test('a missing yt-dlp is the only missing tool the speech code reports', async () => {
  const s = site();
  const result = await s.run({ ytDlpNeed: async () => 'yt-dlp on PATH' });
  assert.deepEqual(result, { missing: 'yt-dlp on PATH' });
  for (const name of ['speech.mjs', 'whisper-node.mjs', 'whisper-model.mjs']) {
    const source = fs.readFileSync(path.resolve('skills/watch/scripts', name), 'utf8');
    assert.doesNotMatch(source, /brew install|pipx|HINTS|missing tool/);
  }
});
