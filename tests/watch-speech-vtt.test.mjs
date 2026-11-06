import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vttOf } from '../skills/watch/scripts/whisper-node.mjs';

const REAL_SEGMENT = { text: ' Hello World, this is a test.', t0: 0, t1: 1840 };

test('vttOf reads whisper.node segment times as milliseconds', () => {
  assert.equal(vttOf([REAL_SEGMENT]), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.840\nHello World, this is a test.\n');
});

test('vttOf carries minutes and hours from milliseconds', () => {
  const vtt = vttOf([{ text: 'late', t0: 3723004, t1: 3725500 }]);
  assert.match(vtt, /01:02:03\.004 --> 01:02:05\.500\nlate/);
});
