import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runResearchScript, savePage } from './research-cli.mjs';

function runWithPages(pages) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-verify-'));
  const refs = pages.map(([url, text]) => savePage(runDir, url, text).stdout.split('\t')[0]);
  return { runDir, refs };
}

function addClaim(runDir, claimRow) {
  return runResearchScript('claims.mjs', ['add', runDir, JSON.stringify(claimRow)]);
}

function verifyReport(runDir) {
  const run = runResearchScript('verify.mjs', [runDir]);
  const failures = run.stdout.split('\n').filter(Boolean);
  assert.equal(run.status, failures.length === 0 ? 0 : 1);
  return failures;
}

function claim(ref, overrides) {
  return { id: 'c1', sentence: 's', ref, quote: 'grew 12% in 2024', kind: 'web', time_class: 'volatile', ...overrides };
}

function writeReport(runDir, body) {
  fs.writeFileSync(path.join(runDir, 'answer.md'), body);
}

test('addClaim accepts a quote after whitespace and case folding', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'Sales GREW   12%\nin 2024.']]);
  assert.equal(addClaim(runDir, claim(refs[0])).stdout, `c1\t${refs[0]}\tadded\n`);
});

test('addClaim refuses a quote that is not on the page', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'Sales fell.']]);
  const refused = addClaim(runDir, claim(refs[0]));
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /quote not on page/);
  assert.equal(fs.existsSync(path.join(runDir, 'claims.jsonl')), false);
});

test('verifyReport passes a footnote backed by a matching quote', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'Sales grew 12% in 2024.']]);
  addClaim(runDir, claim(refs[0]));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n\n[^c1]: a.example\n');
  assert.deepEqual(verifyReport(runDir), []);
});

test('verifyReport flags a footnote with no stored claim', () => {
  const { runDir } = runWithPages([]);
  writeReport(runDir, 'Something is true.[^c9]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c9]\tno stored claim']);
});

test('verifyReport flags a number missing from the quote', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'Sales grew 12% in 2024.']]);
  addClaim(runDir, claim(refs[0]));
  writeReport(runDir, 'Sales grew 15% in 2024.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tnumber 15 not in quote']);
});

test('verifyReport needs a second domain for forum-only claims', () => {
  const { runDir, refs } = runWithPages([
    ['https://forum.example/a', 'Sales grew 12% in 2024.'],
    ['https://other.example/b', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tforum or social source needs a second independent domain']);
  addClaim(runDir, claim(refs[1], { kind: 'forum' }));
  assert.deepEqual(verifyReport(runDir), []);
});

test('addClaim folds curly quotes to straight', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'He said “hi” and it’s fine.']]);
  assert.equal(addClaim(runDir, claim(refs[0], { quote: 'said "hi" and it\'s fine' })).stdout, `c1\t${refs[0]}\tadded\n`);
});

test('verifyReport matches whole numbers only', () => {
  const { runDir, refs } = runWithPages([['https://a.example/x', 'Sales grew 100 times.']]);
  addClaim(runDir, claim(refs[0], { quote: 'grew 100 times' }));
  writeReport(runDir, 'Sales grew 10 times.[^c1]\n');
  assert.deepEqual(verifyReport(runDir), ['[^c1]\tnumber 10 not in quote']);
});

test('verifyReport counts subdomains of one site as one domain', () => {
  const { runDir, refs } = runWithPages([
    ['https://reddit.com/r/x/1', 'Sales grew 12% in 2024.'],
    ['https://old.reddit.com/r/y/2', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { kind: 'forum' }));
  addClaim(runDir, claim(refs[1], { kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^c1]\n');
  assert.equal(verifyReport(runDir).length, 1);
});

test('verifyReport counts the sources of every footnote in the sentence', () => {
  const { runDir, refs } = runWithPages([
    ['https://reddit.com/r/x/1', 'Sales grew 12% in 2024.'],
    ['https://news.ycombinator.com/item?id=1', 'Sales grew 12% in 2024.'],
  ]);
  addClaim(runDir, claim(refs[0], { id: 'a', kind: 'forum' }));
  addClaim(runDir, claim(refs[1], { id: 'b', kind: 'forum' }));
  writeReport(runDir, 'Sales grew 12% in 2024.[^a][^b]\n');
  assert.deepEqual(verifyReport(runDir), []);
});
