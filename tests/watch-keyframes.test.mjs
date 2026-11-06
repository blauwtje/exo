import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import './watch-gate-env.mjs';
import { tempDir } from './harness.mjs';

const script = path.resolve('skills/watch/scripts/transcript.mjs');
const URL_ = 'https://www.tiktok.com/@u/video/7301234567890123456';
const ID = 'tiktok-7301234567890123456';
const INFO = { id: '7301234567890123456', extractor_key: 'TikTok', title: 'Quiet', duration: 60, subtitles: {}, automatic_captions: {} };
const SHORT = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello from the audio\n';
const LONG = `WEBVTT\n\n00:00:00.000 --> 00:00:30.000\n${Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ')}\n`;
const MUSIC = 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\n[Music]\n';

const shebang = `#!${process.execPath}\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst args = process.argv.slice(2);\n`;
const logged = (name) => `fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n');\n`;
const STUBS = {
  'yt-dlp': `${shebang}${logged('yt-dlp')}
if (args.includes('--version')) process.exit(0);
if (args.includes('-J')) { console.log(process.env.FAKE_INFO); process.exit(0); }
const folder = args[args.indexOf('-P') + 1];
if (args.includes('bv*/b')) {
  if (process.env.FAKE_FAIL === 'video') { console.error('ERROR: no video'); process.exit(1); }
  fs.writeFileSync(path.join(folder, 'video.mp4'), 'video');
} else {
  fs.writeFileSync(path.join(folder, 'audio.m4a'), 'audio');
}
`,
  ffmpeg: `${shebang}${logged('ffmpeg')}
if (process.env.FAKE_FAIL === 'frames' && args.includes('-frames:v')) { console.error('Invalid frame'); process.exit(1); }
fs.writeFileSync(args.at(-1), 'out');
`,
  'whisper-cli': `${shebang}${logged('whisper-cli')}
fs.writeFileSync(args[args.indexOf('-of') + 1] + '.vtt', process.env.FAKE_VTT);
`,
};

function setup(vtt, more = {}) {
  const dir = fs.realpathSync(tempDir('keyframes-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const [name, body] of Object.entries(STUBS)) fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  const model = path.join(dir, 'ggml.bin');
  fs.writeFileSync(model, 'model');
  const log = path.join(dir, 'calls.log');
  const env = { ...process.env, PATH: bin, FAKE_LOG: log, FAKE_INFO: JSON.stringify(INFO), FAKE_VTT: vtt, ...more };
  const out = path.join(dir, 'out');
  const result = spawnSync(process.execPath, [script, '--url', URL_, '--out', out, '--model', model], { encoding: 'utf8', env });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  return { result, calls, folder: path.join(out, ID) };
}

test('a transcript under 15 words adds six keyframes and names them on the line', () => {
  const site = setup(SHORT);
  assert.equal(site.result.status, 0, site.result.stderr);
  assert.ok(site.result.stdout.trimEnd().endsWith(` frames=${path.join(site.folder, 'frames')} (6 files)`), site.result.stdout);
  assert.deepEqual(fs.readdirSync(path.join(site.folder, 'frames')).sort(), ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg', '06.jpg']);
  const video = site.calls.find((args) => args[0] === 'yt-dlp' && args.includes('bv*/b'));
  const at = video.indexOf('-f');
  assert.deepEqual(video.slice(at, at + 4), ['-f', 'bv*/b', '-S', 'res:480']);
  assert.deepEqual(fs.readdirSync(site.folder).sort(), ['frames', 'raw.vtt', 'transcript.txt']);
  const seeks = site.calls.filter((args) => args[0] === 'ffmpeg' && args.includes('-ss')).map((args) => Number(args[args.indexOf('-ss') + 1])).sort((a, b) => a - b);
  assert.deepEqual(seeks, [5, 15, 25, 35, 45, 55]);
});

test('a video with no speech at all also gets keyframes', () => {
  const site = setup(MUSIC);
  assert.equal(fs.readFileSync(path.join(site.folder, 'transcript.txt'), 'utf8'), 'no speech in this video\n');
  assert.match(site.result.stdout, / words=0 .* frames=.*\/frames \(6 files\)\n$/);
});

test('a transcript of 15 words or more fetches no video', () => {
  const site = setup(LONG);
  assert.doesNotMatch(site.result.stdout, /frames=/);
  assert.ok(!site.calls.some((args) => args.includes('bv*/b')));
  assert.ok(!fs.existsSync(path.join(site.folder, 'frames')));
});

test('a failed frame leaves the transcript line intact and appends nothing', () => {
  const site = setup(SHORT, { FAKE_FAIL: 'frames' });
  assert.equal(site.result.status, 0, site.result.stderr);
  assert.doesNotMatch(site.result.stdout, /frames=/);
  assert.match(site.result.stdout, /^id=tiktok-7301234567890123456 title="Quiet" .* words=4 /);
  assert.deepEqual(fs.readdirSync(site.folder).sort(), ['raw.vtt', 'transcript.txt']);
});

test('a failed video download leaves the transcript line intact', () => {
  const site = setup(SHORT, { FAKE_FAIL: 'video' });
  assert.doesNotMatch(site.result.stdout, /frames=/);
  assert.ok(fs.existsSync(path.join(site.folder, 'transcript.txt')));
  assert.deepEqual(fs.readdirSync(site.folder).sort(), ['raw.vtt', 'transcript.txt']);
});
