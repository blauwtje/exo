import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCitations, pageReader, savedPages } from '../lib/check-citations.mjs';

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

test('savedPages maps a cited Reddit url to its saved page text beside the cites file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cites-'));
  const url = 'https://www.reddit.com/r/test/comments/abc123/title/';
  fs.writeFileSync(path.join(dir, 'sources.jsonl'), `${JSON.stringify({ ref: 'r1', url, url_fetched: url })}\n`);
  fs.writeFileSync(path.join(dir, 't-abc123.txt'), 'Comment: the  Quick brown fox');
  const pages = savedPages(dir);
  assert.equal(pages.get(url), 'Comment: the  Quick brown fox');
  const fetched = [];
  const read = pageReader(pages, async (target) => { fetched.push(target); return 'remote'; });
  const checked = await checkCitations([{ url, quote: 'quick brown fox' }, { url: 'https://a.test', quote: 'remote' }], read);
  assert.deepEqual(checked.map((entry) => entry.status), ['verified', 'verified']);
  assert.deepEqual(fetched, ['https://a.test']);
});

test('savedPages is empty when no sources.jsonl sits beside the cites file', () => {
  assert.equal(savedPages(fs.mkdtempSync(path.join(os.tmpdir(), 'cites-'))).size, 0);
});
