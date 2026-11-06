import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mergeReviews, minScoreOf } from '../skills/gate/scripts/merge-reviews.mjs';
import { gitRepository } from './harness.mjs';

const SCRIPT = path.resolve('skills/gate/scripts/merge-reviews.mjs');

const fixLines = ['  Probe: true', '  Class: swallowed failure', '  Sweep: true'];

const finding = (head, { cite, score, category }, details = []) => [
  head,
  ...details,
  ...(cite ? [`  Cite: ${cite}`] : []),
  ...(score ? [`  Score: ${score}`] : []),
  ...(category ? [`  Category: ${category}`] : [])
].join('\n');

const report = () => [
  'FINDINGS',
  finding('src/a.js:2-3; defect; swallowed failure; catch drops error; fix', { cite: 'CLAUDE.md:3', score: 9, category: 'correctness' }, fixLines),
  finding('src/a.js:5; note; naming; vague name; report', { cite: 'CLAUDE.md:2', score: 6, category: 'style' }),
  finding('src/a.js:6; note; naming; second vague name; report', { cite: 'CLAUDE.md:2', score: 2, category: 'style' }),
  finding('src/a.js:7-8; defect; swallowed failure; uncited guess; fix', { score: 8, category: 'correctness' }, fixLines),
  finding('src/a.js:9; concern; layout; uncited worry; report', { score: 7, category: 'style' }),
  ''
].join('\n');

const checkout = () => gitRepository({ 'CLAUDE.md': 'one\ntwo\nthree\nfour\n', 'src/a.js': 'a\n'.repeat(12) });

test('a cited high-score defect stays a fix and shows first under its category', async () => {
  const merged = mergeReviews([{ name: 'review-branch', text: report() }], new Map(), null, await checkout());
  assert.equal(merged.counts.fix, 1);
  assert.equal(merged.groups[0].category, 'correctness');
  assert.match(merged.groups[0].text, /^src\/a\.js:2-3; defect;.*; fix$/);
});

test('findings group by category, sort by score and hide those under the threshold with a count', async () => {
  const merged = mergeReviews([{ name: 'review-branch', text: report() }], new Map(), null, await checkout());
  assert.deepEqual(merged.groups.map(({ category }) => category), ['correctness', 'style', 'uncited', 'uncited']);
  assert.equal(merged.hidden, 1);
  assert.equal(merged.minScore, 4);
  assert.equal(merged.shown.some((line) => line.includes('second vague name')), false);
});

test('an uncited fix becomes a report and an uncited concern a note, both counted', async () => {
  const merged = mergeReviews([{ name: 'review-branch', text: report() }], new Map(), null, await checkout());
  assert.equal(merged.uncited, 2);
  assert.equal(merged.counts.concern, 0);
  assert.equal(merged.counts.note, 3);
  assert.equal(merged.counts.fix, 1);
  assert.ok(merged.shown.includes('src/a.js:7-8; defect; swallowed failure; uncited guess; report'));
});

test('a cite past the end of its file is uncited', async () => {
  const text = `FINDINGS\n${finding('src/a.js:2; defect; r; e; fix', { cite: 'CLAUDE.md:99', score: 9, category: 'correctness' }, fixLines)}\n`;
  const merged = mergeReviews([{ name: 'review-branch', text }], new Map(), null, await checkout());
  assert.equal(merged.counts.fix, 0);
  assert.equal(merged.uncited, 1);
});

test('a report with no Cite, Score or Category line keeps today handling', async () => {
  const text = `FINDINGS\nsrc/a.js:2; defect; r; e; fix\n${fixLines.join('\n')}\n`;
  const merged = mergeReviews([{ name: 'review-branch', text }], new Map(), null, await checkout());
  assert.equal(merged.counts.fix, 1);
  assert.equal(merged.uncited, 0);
});

test('minScoreOf takes the flag, then EXO_REVIEW_MIN_SCORE, then 4', () => {
  assert.equal(minScoreOf('1', { EXO_REVIEW_MIN_SCORE: '7' }), 1);
  assert.equal(minScoreOf(undefined, { EXO_REVIEW_MIN_SCORE: '7' }), 7);
  assert.equal(minScoreOf(undefined, {}), 4);
});

test('the command prints CATEGORY groups and the hidden line, and --min-score 1 hides nothing', async () => {
  const root = await checkout();
  const file = path.join(root, 'review-branch.md');
  fs.writeFileSync(file, report());
  const run = (...extra) => spawnSync(process.execPath, [SCRIPT, '--root', root, '--base', 'HEAD', '--report', file, ...extra], { encoding: 'utf8', env: { ...process.env, EXO_REVIEW_MIN_SCORE: '' } }).stdout;
  const out = run();
  assert.match(out, /^1 findings under score 4 hidden$/m);
  assert.match(out, /^UNCITED 2 finding/m);
  assert.ok(out.indexOf('CATEGORY correctness') < out.indexOf('CATEGORY style'));
  assert.ok(out.indexOf('CATEGORY style') < out.indexOf('CATEGORY uncited'));
  assert.doesNotMatch(run('--min-score', '1'), /hidden/);
});
