import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';
import './watch-gate-env.mjs';

const script = path.resolve('skills/watch/scripts/transcript.mjs');
const VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello there\n\n00:00:03.000 --> 00:00:06.000\nsecond line\n';

const FAKE_YT_DLP = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2025.01.01'); process.exit(0); }
const url = args.at(-1);
const reply = JSON.parse(fs.readFileSync(process.env.FAKE_MAP, 'utf8'))[url];
const started = Date.now();
if (args.includes('-J')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ url, args, started, ended: Date.now() }) + '\\n');
if (reply.until) {
  const mark = process.env.FAKE_LOG + '.first';
  if (!fs.existsSync(mark)) fs.writeFileSync(mark, String(started));
  if (started - Number(fs.readFileSync(mark, 'utf8')) < reply.until) { console.error('ERROR: HTTP Error 429: Too Many Requests'); process.exit(1); }
}
if (reply.error) { console.error(reply.error); process.exit(1); }
if (args.includes('-J')) { console.log(JSON.stringify(reply.info)); process.exit(0); }
const lang = args[args.indexOf('--sub-langs') + 1];
const template = args[args.indexOf('-o') + 1];
fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], template.replace('%(id)s', reply.info.id).replace('%(ext)s', lang + '.vtt')), fs.readFileSync(process.env.FAKE_VTT, 'utf8'));
`;

const urlOf = (id) => `https://www.tiktok.com/@u/video/${id}`;
const infoOf = (id) => ({ info: { id, extractor_key: 'TikTok', title: `Clip ${id}`, duration: 120, language: 'en', subtitles: { en: [{ ext: 'vtt' }] }, automatic_captions: {} } });

function batch(replies, rateWaitMs = '0') {
  const dir = tempDir('exo-batch-');
  const bin = path.join(dir, 'bin');
  const out = path.join(dir, 'out');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'yt-dlp'), FAKE_YT_DLP, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(Object.fromEntries(Object.entries(replies).map(([id, reply]) => [urlOf(id), reply]))));
  fs.writeFileSync(path.join(dir, 'in.vtt'), VTT);
  const env = { PATH: bin, CLAUDE_PLUGIN_DATA: path.join(dir, 'data'), EXO_WATCH_GATE_MS: '0', EXO_WATCH_BACKOFF_MS: '0', EXO_WATCH_RATE_WAIT_MS: rateWaitMs, FAKE_MAP: path.join(dir, 'map.json'), FAKE_LOG: path.join(dir, 'calls.log'), FAKE_VTT: path.join(dir, 'in.vtt') };
  const run = (args, input) => spawnSync(process.execPath, [script, ...args, '--out', out], { encoding: 'utf8', env, input });
  const calls = () => (fs.existsSync(env.FAKE_LOG) ? fs.readFileSync(env.FAKE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  const metadataCalls = () => calls().filter((call) => call.args.includes('-J'));
  const write = (name, text) => {
    fs.writeFileSync(path.join(dir, name), text);
    return path.join(dir, name);
  };
  const rerun = (command) => spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', env: { ...env, PATH: `${bin}:${path.dirname(process.execPath)}` }, input: '' });
  return { dir, out, run, rerun, calls, metadataCalls, write };
}

const lines = (text) => text.split('\n').filter(Boolean);
const urlArgs = (...ids) => ids.flatMap((id) => ['--url', urlOf(id)]);

test('repeated --url runs the videos one after another, never overlapping, and ends with one summary line', () => {
  const { run, calls } = batch({ 111: infoOf('111'), 222: infoOf('222'), 333: infoOf('333') });
  const result = run(urlArgs('111', '222', '333'));
  assert.equal(result.status, 0, result.stderr);
  const output = lines(result.stdout);
  assert.equal(output.length, 4);
  assert.match(output[0], /^id=tiktok-111 /);
  assert.match(output[2], /^id=tiktok-333 /);
  assert.equal(output[3], 'batch done=3 skipped=0 failed=0');
  const ordered = calls().sort((a, b) => a.started - b.started);
  ordered.slice(1).forEach((call, index) => assert.ok(ordered[index].ended <= call.started, 'two yt-dlp calls overlapped'));
});

test('--from reads one url per line, ignoring blank lines, text after the url and the list summary line', () => {
  const { run, write, metadataCalls } = batch({ 111: infoOf('111'), 222: infoOf('222') });
  const file = write('urls.txt', `${urlOf('111')} | Clip 111 | 2025-01-31 | 1:05 | 1200 views\n\n   \n${urlOf('222')}\t trailing words\r\n2 entries from example\n`);
  const result = run(['--from', file]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lines(result.stdout).at(-1), 'batch done=2 skipped=0 failed=0');
  assert.equal(metadataCalls().length, 2);
});

test('--from - reads the urls from stdin and mixes with --url', () => {
  const { run, metadataCalls } = batch({ 111: infoOf('111'), 222: infoOf('222') });
  const result = run(['--from', '-', ...urlArgs('222')], `${urlOf('111')} | Clip 111\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lines(result.stdout).at(-1), 'batch done=2 skipped=0 failed=0');
  assert.deepEqual(metadataCalls().map((call) => call.url), [urlOf('222'), urlOf('111')]);
});

test('a finished video is skipped on the next run without calling yt-dlp, and --force redoes it', () => {
  const { run, calls } = batch({ 111: infoOf('111'), 222: infoOf('222') });
  const first = run(urlArgs('111', '222'));
  assert.equal(first.status, 0, first.stderr);
  const before = calls().length;
  const second = run(urlArgs('111', '222'));
  assert.equal(second.status, 0, second.stderr);
  assert.equal(calls().length, before);
  const output = lines(second.stdout);
  assert.match(output[0], /^skipped id=tiktok-111 .*transcript=/);
  assert.equal(output.at(-1), 'batch done=0 skipped=2 failed=0');
  const forced = run([...urlArgs('111', '222'), '--force']);
  assert.equal(lines(forced.stdout).at(-1), 'batch done=2 skipped=0 failed=0');
  assert.ok(calls().length > before);
});

test('a half-written video is redone, because only a finished run marks it done', () => {
  const { run, out, metadataCalls } = batch({ 111: infoOf('111') });
  fs.mkdirSync(path.join(out, 'tiktok-111'), { recursive: true });
  fs.writeFileSync(path.join(out, 'tiktok-111', 'transcript.txt'), 'half');
  const result = run(urlArgs('111'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(metadataCalls().length, 1);
  assert.notEqual(fs.readFileSync(path.join(out, 'tiktok-111', 'transcript.txt'), 'utf8'), 'half');
});

test('a done video whose transcript was deleted is redone', () => {
  const { run, out, metadataCalls } = batch({ 111: infoOf('111') });
  run(urlArgs('111'));
  fs.rmSync(path.join(out, 'tiktok-111', 'transcript.txt'));
  const result = run(urlArgs('111'));
  assert.match(result.stdout, /^id=tiktok-111 /);
  assert.equal(metadataCalls().length, 2);
});

test('a failed video does not stop the batch, is grouped by its failure in the summary and is retried next run', () => {
  const { run, metadataCalls } = batch({
    111: { error: 'ERROR: private video' },
    222: infoOf('222'),
    333: { error: 'ERROR: private video' },
  });
  const result = run(urlArgs('111', '222', '333'));
  assert.equal(result.status, 0);
  assert.equal(lines(result.stderr).length, 2);
  const summary = lines(result.stdout).at(-1);
  assert.match(summary, /^batch done=1 skipped=0 failed=2 \| .*private\/removed.* \(.*111.*, .*333.*\)$/);
  run(urlArgs('111', '222', '333'));
  assert.equal(metadataCalls().length, 3 + 2);
});

test('different failures form different groups', () => {
  const { run } = batch({ 111: { error: 'ERROR: private video' }, 222: { error: 'ERROR: unsupported url' }, 333: infoOf('333') });
  const summary = lines(run(urlArgs('111', '222', '333')).stdout).at(-1);
  assert.equal(summary.split(' | ').length, 3);
});

test('exit code is 1 only when every video failed', () => {
  const { run } = batch({ 111: { error: 'ERROR: gone' }, 222: { error: 'ERROR: gone' } });
  const result = run(urlArgs('111', '222'));
  assert.equal(result.status, 1);
  assert.match(lines(result.stdout).at(-1), /^batch done=0 skipped=0 failed=2 \| /);
});

test('a single video prints no summary line', () => {
  const { run } = batch({ 111: infoOf('111') });
  const result = run(urlArgs('111'));
  assert.equal(lines(result.stdout).length, 1);
});

test('bad batch input exits 2: no url at all, a missing file, an empty file', () => {
  const { run, write, dir } = batch({});
  assert.equal(run([]).status, 2);
  assert.equal(run(['--from', path.join(dir, 'missing.txt')]).status, 2);
  assert.equal(run(['--from', write('empty.txt', '\n  \n')]).status, 2);
});

const RATE_LIMITED = { error: 'ERROR: HTTP Error 429: Too Many Requests' };

test('a rate-limited video stops the batch: no later video starts, exit 75 with the open count and the restart command', () => {
  const { run, metadataCalls } = batch({ 111: infoOf('111'), 222: RATE_LIMITED, 333: infoOf('333'), 444: infoOf('444') });
  const result = run(urlArgs('111', '222', '333', '444'));
  assert.equal(result.status, 75);
  assert.ok(!metadataCalls().some((call) => call.url === urlOf('333')));
  const summary = lines(result.stdout).at(-1);
  assert.match(summary, /^batch done=1 skipped=0 failed=0 open=3 \| rate-limited \| restart: node .*transcript\.mjs .*--url .*333/);
  assert.ok(lines(result.stderr).some((line) => /rate-limited/.test(line)));
});

test('the restart command of a stdin batch lists the open videos and starts them', () => {
  const { run, rerun, metadataCalls } = batch({ 111: infoOf('111'), 222: RATE_LIMITED, 333: infoOf('333') });
  const result = run(['--from', '-'], [111, 222, 333].map(urlOf).join('\n'));
  assert.equal(result.status, 75);
  const restart = lines(result.stdout).at(-1).replace(/^.*restart: /, '');
  const before = metadataCalls().length;
  const again = rerun(restart);
  assert.doesNotMatch(again.stderr, /holds no url/);
  assert.ok(metadataCalls().slice(before).some((call) => call.url === urlOf('222')));
});

test('a probe that succeeds resumes the batch', () => {
  const { run } = batch({ 111: { ...infoOf('111'), until: 1500 }, 222: infoOf('222') }, '5000');
  const result = run(urlArgs('111', '222'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lines(result.stdout).at(-1), 'batch done=2 skipped=0 failed=0');
  assert.ok(lines(result.stderr).some((line) => /resumed/.test(line)));
});

test('a 403 does not trip the breaker', () => {
  const { run } = batch({ 111: { error: 'ERROR: HTTP Error 403: Forbidden' }, 222: infoOf('222') });
  const result = run(urlArgs('111', '222'));
  assert.equal(result.status, 0);
  assert.match(lines(result.stdout).at(-1), /^batch done=1 skipped=0 failed=1 \| /);
});
