import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addClaim } from '../skills/spec/scripts/claims.mjs';
import { savePageText } from '../skills/spec/scripts/fetch.mjs';
import { verifyReport } from '../skills/spec/scripts/verify.mjs';

async function runWithPages(pages) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-verify-'));
  const refs = [];
  for (const [url, text] of pages) refs.push((await savePageText(url, text, { runDir })).ref);
  return { runDir, refs };
}

function claim(ref, overrides) {
  return { id: 'c1', sentence: 's', ref, quote: 'grew 12% in 2024', kind: 'web', time_class: 'volatile', ...overrides };
}

function writeReport(runDir, body) {
  fs.writeFileSync(path.join(runDir, 'report.md'), body);
}

test('addClaim accepts a quote after whitespace and case folding', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'Sales GREW   12%\nin 2024.']]);
  assert.equal(addClaim(runDir, claim(refs[0])).id, 'c1');
});

test('addClaim refuses a quote that is not on the page', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'Sales fell.']]);
  assert.throws(() => addClaim(runDir, claim(refs[0])), /quote not on page/);
  assert.equal(fs.existsSync(path.join(runDir, 'claims.jsonl')), false);
});

test('verifyReport passes a footnote backed by a matching quote', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'Sales grew 12% in 2024.']]);
  addClaim(runDir, claim(refs[0]));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n\n[^c1]: a.example\n');
  assert.deepEqual(verifyReport(runDir), []);
});

test('verifyReport flags a footnote with no stored claim', async () => {
  const { runDir } = await runWithPages([]);
  writeReport(runDir, 'Something is true.[^c9]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c9]\tno stored claim']);
});

test('verifyReport flags a number missing from the quote', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'Sales grew 12% in 2024.']]);
  addClaim(runDir, claim(refs[0]));
  writeReport(runDir, 'Sales grew 15% in 2024.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tnumber 15 not in quote']);
});

test('verifyReport needs a second domain for forum-only claims', async () => {
  const { runDir, refs } = await runWithPages([
    ['https://forum.example/a', 'Sales grew 12% in 2024.'],
    ['https://other.example/b', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tforum or social source needs a second independent domain']);
  addClaim(runDir, claim(refs[1], { kind: 'forum' }));
  assert.deepEqual(verifyReport(runDir), []);
});

test('addClaim folds curly quotes to straight', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'He said “hi” and it’s fine.']]);
  assert.equal(addClaim(runDir, claim(refs[0], { quote: 'said "hi" and it\'s fine' })).id, 'c1');
});

test('verifyReport matches whole numbers only', async () => {
  const { runDir, refs } = await runWithPages([['https://a.example/x', 'Sales grew 100 times.']]);
  addClaim(runDir, claim(refs[0], { quote: 'grew 100 times' }));
  writeReport(runDir, 'Sales grew 10 times.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tnumber 10 not in quote']);
});

test('verifyReport counts subdomains of one site as one domain', async () => {
  const { runDir, refs } = await runWithPages([
    ['https://reddit.com/r/x/1', 'Sales grew 12% in 2024.'],
    ['https://old.reddit.com/r/y/2', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { kind: 'forum' }));
  addClaim(runDir, claim(refs[1], { kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n');
  assert.equal(verifyReport(runDir).length, 1);
});

test('verifyReport counts the sources of every footnote in the sentence', async () => {
  const { runDir, refs } = await runWithPages([
    ['https://reddit.com/r/x/1', 'Sales grew 12% in 2024.'],
    ['https://news.ycombinator.com/item?id=1', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { id: 'a', kind: 'forum' }));
  addClaim(runDir, claim(refs[1], { id: 'b', kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^a][^b]\n');
  assert.deepEqual(verifyReport(runDir), []);
});
