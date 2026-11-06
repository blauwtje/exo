import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseVtt } from '../skills/watch/scripts/cues.mjs';
import { writeOutputs, headOf } from '../skills/watch/scripts/outputs.mjs';
import { timeLinkOf } from '../skills/watch/scripts/format.mjs';
import { tempDir } from './harness.mjs';

const OPTIONS = { stampSeconds: 45, chunkMinutes: 30 };
const MARKDOWN_LINK = /\[(\d+):(\d{2})(?::(\d{2}))?\]\((https:\/\/[^)]+)\)/g;
const SPEAKER_LABEL = /\(guessed\):/;

function fixtureCues(speakers) {
  return Array.from({ length: 160 }, (_, index) => ({
    start: index * 30,
    text: `line ${index}`,
    ...(speakers ? { speaker: index % 2 === 0 ? 'Jane' : 'Sam' } : {}),
  }));
}

function run(id, cues) {
  const dir = path.join(tempDir('watch-cite-'), id);
  fs.mkdirSync(dir, { recursive: true });
  writeOutputs({ dir, cues, duration: 4800, chapters: [], head: headOf(id, 'Talk'), captions: 'manual:en' }, OPTIONS);
  return dir;
}

function secondsOf(match) {
  const parts = [match[1], match[2], match[3]].filter((part) => part !== undefined).map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function chunkFiles(dir) {
  const folder = path.join(dir, 'chunks');
  return fs.readdirSync(folder).map((name) => fs.readFileSync(path.join(folder, name), 'utf8'));
}

test('every stamp in the transcript and in each chunk is a link that opens at that moment', () => {
  const dir = run('abc12345678', fixtureCues(false));
  const files = [fs.readFileSync(path.join(dir, 'transcript.txt'), 'utf8'), ...chunkFiles(dir)];
  assert.ok(chunkFiles(dir).length >= 2);
  for (const text of files) {
    const links = [...text.matchAll(MARKDOWN_LINK)];
    assert.ok(links.length > 0);
    for (const match of links) {
      assert.equal(match[4], `https://www.youtube.com/watch?v=abc12345678&t=${secondsOf(match)}s`);
    }
    assert.equal(text.match(/\[\d+:\d{2}(?::\d{2})?\]/g).length, links.length);
  }
});

test('a chunk header links to the chunk start and end', () => {
  const dir = run('abc12345678', fixtureCues(false));
  const second = chunkFiles(dir)[1];
  assert.match(second.split('\n')[0], /\]\(https:\/\/www\.youtube\.com\/watch\?v=abc12345678&t=1600s\)-/);
});

test('a site with no time url keeps plain stamps', () => {
  assert.equal(timeLinkOf('tiktok-123'), null);
  const dir = run('tiktok-123', fixtureCues(false));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'transcript.txt'), 'utf8'), /https:/);
});

test('speaker labels appear only when the cues carry speakers, and are marked guessed', () => {
  const plain = run('abc12345678', fixtureCues(false));
  assert.doesNotMatch(fs.readFileSync(path.join(plain, 'transcript.txt'), 'utf8'), SPEAKER_LABEL);
  for (const text of chunkFiles(plain)) assert.doesNotMatch(text, SPEAKER_LABEL);
  const spoken = run('abc12345678', fixtureCues(true));
  const text = fs.readFileSync(path.join(spoken, 'transcript.txt'), 'utf8');
  assert.match(text, /Jane \(guessed\): line 0/);
  assert.match(text, /Sam \(guessed\): line 1/);
});

test('a webvtt body with voice tags or diarized prefixes yields speakers, one without yields none', () => {
  const tagged = parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Jane>Hello there</v>\n\n00:00:02.000 --> 00:00:03.000\n[SPEAKER_01]: Hi\n');
  assert.deepEqual(tagged, [
    { start: 1, text: 'Hello there', speaker: 'Jane' },
    { start: 2, text: 'Hi', speaker: 'SPEAKER_01' },
  ]);
  const bare = parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n');
  assert.deepEqual(bare, [{ start: 1, text: 'Hello there' }]);
});
