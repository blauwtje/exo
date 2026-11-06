import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { watchOne } from '../skills/watch/scripts/watch.mjs';
import { tempDir } from './harness.mjs';

const script = path.resolve('skills/watch/scripts/transcript.mjs');
const URL_ = 'https://www.tiktok.com/@u/video/7301234567890123456';
const SPEECH_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello from the audio\n\n00:00:03.000 --> 00:00:06.000\nsecond spoken line\n';
const INFO = { id: '7301234567890123456', extractor_key: 'TikTok', title: 'Spoken', duration: 6, subtitles: {}, automatic_captions: {} };

const shebang = `#!${process.execPath}\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\n`;
const logged = (name) => `fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n');\n`;
const STUBS = {
  'yt-dlp': `${shebang}${logged('yt-dlp')}
if (args.includes('--version')) process.exit(0);
if (args.includes('-J')) { console.log(process.env.FAKE_INFO); process.exit(0); }
if (process.env.FAKE_FAIL === 'download') { console.error('ERROR: download denied'); process.exit(1); }
fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], 'audio.m4a'), 'audio');
`,
  ffmpeg: `${shebang}${logged('ffmpeg')}
if (process.env.FAKE_FAIL === 'ffmpeg') { console.error('Invalid data found'); process.exit(1); }
if (process.env.FAKE_FAIL === 'hang') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
fs.writeFileSync(args.at(-1), 'wav');
`,
  'whisper-cli': `${shebang}${logged('whisper-cli')}
fs.writeFileSync(args[args.indexOf('-of') + 1] + '.vtt', process.env.FAKE_VTT);
`,
  whisper: `${shebang}${logged('whisper')}
fs.writeFileSync(path.join(args[args.indexOf('--output_dir') + 1], 'audio.vtt'), process.env.FAKE_VTT);
`,
};

function setup(tools, { info = INFO, vtt = SPEECH_VTT } = {}) {
  const dir = fs.realpathSync(tempDir('speech-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const tool of tools) fs.writeFileSync(path.join(bin, tool), STUBS[tool], { mode: 0o755 });
  const model = path.join(dir, 'ggml.bin');
  fs.writeFileSync(model, 'model');
  const env = { ...process.env, PATH: bin, FAKE_LOG: path.join(dir, 'calls.log'), FAKE_INFO: JSON.stringify(info), FAKE_VTT: vtt };
  const out = path.join(dir, 'out');
  const run = (extra = [], more = {}) => spawnSync(process.execPath, [script, '--url', URL_, '--out', out, ...extra], { encoding: 'utf8', env: { ...env, ...more } });
  const calls = () => (fs.existsSync(env.FAKE_LOG) ? fs.readFileSync(env.FAKE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  return { dir, model, out, run, calls, folder: path.join(out, `tiktok-${INFO.id}`) };
}

const ALL = ['yt-dlp', 'ffmpeg', 'whisper-cli', 'whisper'];

test('whisper.cpp transcribes the audio when --model names an existing file', () => {
  const site = setup(ALL);
  const result = site.run(['--model', site.model, '--lang', 'pt-BR']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^id=tiktok-${INFO.id} title="Spoken" duration=0:00:06 captions=speech:whisper\\.cpp words=7 `));
  assert.equal(fs.readFileSync(path.join(site.folder, 'transcript.txt'), 'utf8'), '[00:00] Hello from the audio second spoken line\n');
  const calls = site.calls();
  const download = calls.find((args) => args[0] === 'yt-dlp' && args.includes('-f'));
  assert.deepEqual(download.slice(1, 6), ['--js-runtimes', download[2], '-f', 'bestaudio/best', '--no-playlist']);
  assert.ok(download.includes('audio.%(ext)s'));
  const ffmpeg = calls.find((args) => args[0] === 'ffmpeg');
  assert.deepEqual(ffmpeg.slice(1, 3), ['-nostdin', '-y']);
  assert.ok(ffmpeg.join(' ').includes('-ar 16000 -ac 1 -c:a pcm_s16le'));
  const engine = calls.find((args) => args[0] === 'whisper-cli');
  assert.equal(engine[engine.indexOf('-l') + 1], 'pt');
  assert.ok(engine.includes('-ovtt'));
  assert.deepEqual(fs.readdirSync(site.folder).sort(), ['raw.vtt', 'transcript.txt']);
});

test('openai-whisper runs without a model, detects the language and is renamed to raw.vtt', () => {
  const site = setup(ALL);
  const result = site.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /captions=speech:whisper /);
  const engine = site.calls().find((args) => args[0] === 'whisper');
  assert.ok(engine.includes('--output_format'));
  assert.ok(!engine.includes('--language'));
  assert.ok(fs.existsSync(path.join(site.folder, 'raw.vtt')));
  assert.ok(!fs.existsSync(path.join(site.folder, 'audio.vtt')));
});

test('a missing tool ends the video with the tool and its install command, and downloads nothing', () => {
  const cases = [
    [['yt-dlp', 'whisper'], 'ffmpeg', "'brew install ffmpeg'"],
    [['yt-dlp', 'ffmpeg'], 'whisper', "'pipx install openai-whisper'"],
  ];
  for (const [tools, tool, hint] of cases) {
    const site = setup(tools);
    const result = site.run();
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(`missing tool: the video has no captions, and transcribing its audio needs ${tool} on PATH; install it with `), result.stderr);
    assert.ok(result.stderr.includes(hint), result.stderr);
    assert.ok(!site.calls().some((args) => args[0] === 'yt-dlp' && args.includes('-f')));
  }
});

test('whisper.cpp missing with a model names its install command', () => {
  const site = setup(['yt-dlp', 'ffmpeg', 'whisper']);
  const result = site.run(['--model', site.model]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs whisper-cli on PATH; install it with 'brew install whisper-cpp' plus a ggml model from huggingface\.co\/ggerganov\/whisper\.cpp passed as --model, then rerun/);
});

test('a failing download, ffmpeg or timeout names its step and leaves no audio behind', () => {
  const cases = [
    [{ FAKE_FAIL: 'download' }, /no transcript: the video has no captions, and audio download failed: ERROR: download denied/],
    [{ FAKE_FAIL: 'ffmpeg' }, /ffmpeg failed: Invalid data found/],
    [{ FAKE_FAIL: 'hang', EXO_WATCH_TRANSCRIBE_MS: '300' }, /ffmpeg failed: did not finish within 0\.3 s/],
  ];
  for (const [env, pattern] of cases) {
    const site = setup(ALL);
    const result = site.run([], env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
    assert.deepEqual(fs.readdirSync(site.folder).filter((name) => name.startsWith('audio.')), []);
  }
});

test('a transcript with no cues fails instead of printing words=0', () => {
  const site = setup(ALL, { vtt: 'WEBVTT\n' });
  const result = site.run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /no transcript: no speech found in the audio/);
});

test('a video that has captions never starts the speech route', () => {
  const site = setup(ALL, { info: { ...INFO, subtitles: { en: [{ ext: 'vtt' }] } } });
  site.run();
  assert.ok(!site.calls().some((args) => args[0] === 'ffmpeg' || args[0] === 'whisper'));
});

test('a --lang miss among existing tracks does not start the speech route', () => {
  const site = setup(ALL, { info: { ...INFO, subtitles: { en: [{ ext: 'vtt' }] } } });
  const result = site.run(['--lang', 'de']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no captions in language 'de'/);
  assert.ok(!site.calls().some((args) => args[0] === 'ffmpeg'));
});

test('a YouTube video with zero caption tracks is transcribed from its audio', async () => {
  const site = setup(ALL);
  const saved = { ...process.env };
  Object.assign(process.env, { PATH: path.join(site.dir, 'bin'), FAKE_LOG: path.join(site.dir, 'calls.log'), FAKE_INFO: JSON.stringify(INFO), FAKE_VTT: SPEECH_VTT });
  const player = { playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Tube', lengthSeconds: '6' }, captions: {} };
  const fetchFn = async (url) => new Response(String(url).includes('/player') ? JSON.stringify(player) : '', { status: 200 });
  const options = { out: site.out, chunkMinutes: 30, stampSeconds: 45, fetchMs: 5000, ytDlpMs: 5000, transcribeMs: 5000 };
  const result = await watchOne('abc12345678', options, fetchFn).finally(() => { for (const key of ['PATH', 'FAKE_LOG', 'FAKE_INFO', 'FAKE_VTT']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  assert.equal(result.failure, undefined);
  assert.match(result.line, /^id=abc12345678 title="Tube" duration=0:00:06 captions=speech:whisper /);
});

test('openai-whisper receives --model for a name that is not a file', () => {
  const site = setup(ALL);
  const result = site.run(['--model', 'turbo']);
  assert.equal(result.status, 0, result.stderr);
  const engine = site.calls().find((args) => args[0] === 'whisper');
  assert.equal(engine[engine.indexOf('--model') + 1], 'turbo');
});

test('the audio download takes the first playlist item only', () => {
  const site = setup(ALL);
  site.run();
  const download = site.calls().find((args) => args[0] === 'yt-dlp' && args.includes('-f'));
  assert.equal(download[download.indexOf('--playlist-items') + 1], '1');
});

test('a failed download that left a partial file is not transcribed', () => {
  const site = setup(ALL);
  fs.mkdirSync(site.folder, { recursive: true });
  fs.writeFileSync(path.join(site.folder, 'audio.m4a.part'), 'partial');
  const result = site.run([], { FAKE_FAIL: 'download' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /audio download failed: ERROR: download denied/);
  assert.ok(!site.calls().some((args) => args[0] === 'ffmpeg'));
});

test('sourceOf refuses mistyped ids, mailto and tel inputs', async () => {
  const { sourceOf } = await import('../skills/watch/scripts/video-url.mjs');
  for (const input of ['dQw4w9WgXc', 'mailto:user@example.com', 'tel:123', 'word']) assert.equal(sourceOf(input), null, input);
  assert.deepEqual(sourceOf('tiktok.com/@u/video/1'), { url: 'https://tiktok.com/@u/video/1', host: 'tiktok.com' });
});

test('sourceOf accepts a dotless host only with an explicit http(s) scheme', async () => {
  const { sourceOf } = await import('../skills/watch/scripts/video-url.mjs');
  assert.deepEqual(sourceOf('https://intranet/video.mp4'), { url: 'https://intranet/video.mp4', host: 'intranet' });
  assert.deepEqual(sourceOf('http://localhost:8080/v.mp4'), { url: 'http://localhost:8080/v.mp4', host: 'localhost' });
  assert.equal(sourceOf('intranet/video.mp4'), null);
  assert.equal(sourceOf('localhost:8080/v.mp4'), null);
  assert.equal(sourceOf('mailto:1234@example.com'), null);
});
