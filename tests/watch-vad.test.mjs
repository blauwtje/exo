import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { transcribe } from '../skills/watch/scripts/speech.mjs';
import { runTool } from '../skills/watch/scripts/run-tool.mjs';
import { VAD_MODEL } from '../skills/watch/scripts/whisper-vad.mjs';
import { tempDir } from './harness.mjs';

const WHISPER_BYTES = Buffer.from('fake whisper model');
const VAD_BYTES = Buffer.from('fake vad model');
const pinOf = (file, bytes) => ({
  file,
  url: `https://models.example.com/${file}`,
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});
const WHISPER_PIN = pinOf('ggml-base-q5_1.bin', WHISPER_BYTES);
const VAD_PIN = pinOf('ggml-silero-test.bin', VAD_BYTES);

function fakePackage({ log, spans, vadThrows }) {
  return `
const fs = require('node:fs');
const note = (entry) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(entry) + '\\n');
exports.initWhisperVad = async (init) => {
  note({ vad: init });
  if (${vadThrows}) throw new Error('vad refused');
  return {
    detectSpeechFile: async (file) => { note({ detect: file }); return ${JSON.stringify(spans)}; },
    release: async () => {},
  };
};
exports.initWhisper = async ({ filePath }) => ({
  transcribeFile: (file, options) => {
    note({ whisper: options });
    return { promise: Promise.resolve({ language: 'nl', segments: [{ text: ' hallo wereld', t0: 0, t1: 1500 }] }) };
  },
  release: async () => {},
});
`;
}

function installFake(args, config) {
  const folder = path.join(args[args.indexOf('--prefix') + 1], 'node_modules', '@fugood', 'whisper.node');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: '@fugood/whisper.node', version: '1.1.3', main: 'index.js' }));
  fs.writeFileSync(path.join(folder, 'index.js'), fakePackage(config));
}

function site({ spans = [], vadThrows = false, vadStatus = 200 } = {}) {
  const dir = fs.realpathSync(tempDir('vad-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const cache = path.join(dir, 'cache');
  const log = path.join(dir, 'engine.log');
  const fetched = [];
  const fetchFn = async (url) => {
    fetched.push(String(url));
    if (String(url) === VAD_PIN.url) return new Response(VAD_BYTES, { status: vadStatus });
    return new Response(WHISPER_BYTES, { status: 200 });
  };
  const run = async (command, args, timeout) => {
    if (command !== 'npm') return runTool(command, args, timeout);
    installFake(args, { log, spans, vadThrows });
    return { error: null, stdout: '', stderr: '' };
  };
  const options = {
    env: { CLAUDE_PLUGIN_DATA: cache, PATH: bin },
    home: dir,
    ytDlpNeed: async () => null,
    ytDlpReason: () => 'download denied',
    ytDlpMs: 1000,
    transcribeMs: 20000,
    fetchFn,
    modelPin: WHISPER_PIN,
    vadPin: VAD_PIN,
    runYtDlp: async (args) => {
      fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], 'audio.mp3'), 'audio');
      return { error: null, stdout: '', stderr: '' };
    },
    runTool: run,
  };
  const folder = path.join(dir, 'out', 'video');
  const entries = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return { cache, fetched, entries, run: () => transcribe('https://example.com/v', folder, options) };
}

const whisperOptions = (entries) => entries.filter((entry) => entry.whisper).map((entry) => entry.whisper);

test('the pinned VAD model is a small first-party Silero file with a checksum', () => {
  assert.match(VAD_MODEL.url, /^https:\/\/huggingface\.co\/ggml-org\/whisper-vad\/resolve\/main\/ggml-silero-.*\.bin$/);
  assert.match(VAD_MODEL.sha256, /^[0-9a-f]{64}$/);
  assert.ok(VAD_MODEL.size < 5 * 1024 * 1024);
});

test('when the VAD finds no speech whisper is skipped and the transcript has no cues', async () => {
  const s = site({ spans: [] });
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.deepEqual(whisperOptions(s.entries()), []);
  assert.equal(fs.readFileSync(result.vtt, 'utf8').includes('-->'), false);
});

test('the VAD model is fetched once, cached under the plugin data and loaded without the GPU', async () => {
  const s = site({ spans: [] });
  await s.run();
  await s.run();
  assert.equal(s.fetched.filter((url) => url === VAD_PIN.url).length, 1);
  const init = s.entries().find((entry) => entry.vad).vad;
  assert.equal(init.filePath, path.join(s.cache, 'models', VAD_PIN.file));
  assert.equal(init.useGpu, false);
});

test('when the VAD finds speech whisper hears one window from the first speech start to the last speech end', async () => {
  const s = site({ spans: [{ t0: 202, t1: 260 }, { t0: 300, t1: 560 }] });
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.equal(result.language, 'nl');
  assert.deepEqual(whisperOptions(s.entries()), [{ language: 'auto', offset: 2020, duration: 3580 }]);
});

test('a VAD model that cannot be downloaded falls back to whisper over the whole file', async () => {
  const s = site({ vadStatus: 500 });
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.deepEqual(whisperOptions(s.entries()), [{ language: 'auto' }]);
});

test('a VAD that throws falls back to whisper over the whole file', async () => {
  const s = site({ vadThrows: true });
  const result = await s.run();
  assert.equal(result.failure, undefined);
  assert.deepEqual(whisperOptions(s.entries()), [{ language: 'auto' }]);
});
