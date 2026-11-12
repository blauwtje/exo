import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyOutsideFailure } from '../lib/outside-limit.mjs';

test('classifies status and yt-dlp text apart', () => {
  assert.equal(classifyOutsideFailure({ status: 429 }), 'rate-limited');
  assert.equal(classifyOutsideFailure({ text: 'ERROR: HTTP Error 429: Too Many Requests' }), 'rate-limited');
  assert.equal(classifyOutsideFailure({ status: 403 }), 'refused');
  assert.equal(classifyOutsideFailure({ text: 'HTTP Error 403: Forbidden' }), 'refused');
  assert.equal(classifyOutsideFailure({ status: 503 }), 'server');
  assert.equal(classifyOutsideFailure({ text: 'HTTP Error 502' }), 'server');
  assert.equal(classifyOutsideFailure({ text: 'no captions' }), 'other');
  assert.equal(classifyOutsideFailure(), 'other');
});
