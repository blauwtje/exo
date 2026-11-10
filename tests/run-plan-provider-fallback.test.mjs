import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackModel } from '../skills/build/scripts/run-plan-provider.mjs';

test('a listed model outside the tiers still falls back to the strong tier', () => {
  assert.equal(fallbackModel('fable', {}), 'opus');
});

test('the inherit sentinel is never a fallback model', () => {
  assert.equal(fallbackModel('deepseek-flash', {}), null);
});
