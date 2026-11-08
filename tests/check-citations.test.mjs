import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCitations } from '../lib/check-citations.mjs';

const PAGES = { 'https://a.test': 'The  quick\nbrown fox jumps.' };

async function readPage(url) {
  if (!(url in PAGES)) throw new Error('down');
  return PAGES[url];
}

test('checkCitations marks a quote verified, missing or unreachable', async () => {
  const checked = await checkCitations([
    { url: 'https://a.test', quote: 'Quick brown fox' },
    { url: 'https://a.test', quote: 'lazy dog' },
    { url: 'https://b.test', quote: 'anything' }
  ], readPage);
  assert.deepEqual(checked.map((entry) => entry.status), ['verified', 'missing', 'unreachable']);
});
