import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { changedFiles, findingsDigest, mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';

const MERGE = fileURLToPath(new URL('../skills/verify/scripts/merge-reviews.mjs', import.meta.url));
const FILES = ['a.js', 'b.js', 'c.js', 'd.js'];
const report = (name, ...read) => ({ name, text: `CLEAN\n\nCount: defect=0 concern=0 question=0 note=0\nRead: ${read.join(', ')}\nUnread: none\n` });

test('a review that read 3 of 4 changed files merges as FINDINGS and names the unread file', () => {
  const merged = mergeReviews([report('review-branch', 'a.js', 'b.js', 'c.js')], new Map(), FILES);
  assert.equal(merged.verdict, 'FINDINGS');
  assert.deepEqual(merged.coverage, { read: 3, total: 4, unread: ['d.js'] });
});

test('Read: lines of several branch shards add up to full coverage', () => {
  const merged = mergeReviews([report('review-branch-1', 'a.js', 'b.js'), report('review-branch-2', 'c.js', 'd.js')], new Map(), FILES);
  assert.equal(merged.verdict, 'CLEAN');
  assert.deepEqual(merged.coverage, { read: 4, total: 4, unread: [] });
});

test('a branch report with no Read: line leaves every changed file unread', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: 'CLEAN\n' }], new Map(), FILES);
  assert.equal(merged.verdict, 'FINDINGS');
  assert.equal(merged.coverage.read, 0);
});

test('a report that is not a branch review adds no read file and no coverage', () => {
  const overlap = mergeReviews([report('review-overlap', 'a.js')], new Map(), FILES);
  assert.equal(overlap.coverage, null);
  assert.equal(overlap.verdict, 'CLEAN');
  const mixed = mergeReviews([report('review-branch', 'a.js'), report('review-overlap', 'b.js', 'c.js', 'd.js')], new Map(), FILES);
  assert.equal(mixed.coverage.read, 1);
});

test('full coverage keeps CLEAN and a worse verdict is not lowered', () => {
  assert.equal(mergeReviews([report('review-branch', ...FILES)], new Map(), FILES).verdict, 'CLEAN');
  const blocked = mergeReviews([{ name: 'review-branch', text: 'BLOCKED\nRead: a.js\n' }], new Map(), FILES);
  assert.equal(blocked.verdict, 'BLOCKED');
});

test('without a changed-file list no coverage is judged', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: 'CLEAN\n' }]);
  assert.equal(merged.coverage, null);
  assert.equal(merged.verdict, 'CLEAN');
});

test('absolute Read: paths inside the checkout root count as read and paths outside it do not', () => {
  const root = path.join(os.tmpdir(), 'abs-root');
  const merged = mergeReviews([report('review-branch', path.join(root, 'a.js'), path.join(root, 'b.js'), path.join(os.tmpdir(), 'other', 'c.js'), 'd.js')], new Map(), FILES, root);
  assert.deepEqual(merged.coverage, { read: 3, total: 4, unread: ['c.js'] });
});

test('merge-reviews.mjs prints COVERAGE and one UNREAD-FILE line per changed file nobody read', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-'));
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  git('switch', '-q', '-c', 'feat/x');
  for (const name of FILES) fs.writeFileSync(path.join(root, name), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: files');
  const file = path.join(root, 'review-branch.md');
  fs.writeFileSync(file, 'CLEAN\n\nRead: a.js, b.js, c.js\n');
  const lines = execFileSync(process.execPath, [MERGE, '--root', root, '--base', 'main', '--report', file], { encoding: 'utf8' }).trim().split('\n');
  assert.match(lines[0], /^verdict=FINDINGS /);
  assert.ok(lines.includes('COVERAGE 3/4'), lines.join('\n'));
  assert.ok(lines.includes('UNREAD-FILE d.js'), lines.join('\n'));
  assert.equal(lines.filter((line) => line.startsWith('UNREAD-FILE')).length, 1);
  const written = fs.readFileSync(path.join(root, '.exo', 'branch-review.md'), 'utf8');
  assert.ok(lines.includes(`FINDINGS-SHA ${findingsDigest(written)}`), lines.join('\n'));
});

test('findingsDigest ignores fixer marks, indented detail and FAIL lines, and sees a changed or added finding', () => {
  const reviewed = '- fix a.js:1 broken\n- report b.js:2 naming\n';
  const marked = '- fix a.js:1 broken fixed\n  Probe: true\n- report b.js:2 naming reported: out of scope\nFAIL probe x\n  detail\n';
  assert.equal(findingsDigest(marked), findingsDigest(reviewed));
  assert.notEqual(findingsDigest('- fix a.js:1 changed\n- report b.js:2 naming\n'), findingsDigest(reviewed));
  assert.notEqual(findingsDigest(`${reviewed}- fix c.js:3 new\n`), findingsDigest(reviewed));
});

function divergedRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diverged-'));
  const run = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  run('init', '-q', '-b', 'main');
  run('commit', '-q', '--allow-empty', '-m', 'init');
  run('switch', '-q', '-c', 'work');
  fs.writeFileSync(path.join(root, 'branch.js'), 'a\n');
  run('add', '.');
  run('commit', '-q', '-m', 'branch change');
  run('switch', '-q', 'main');
  fs.writeFileSync(path.join(root, 'main-only.js'), 'b\n');
  run('add', '.');
  run('commit', '-q', '-m', 'main change');
  run('switch', '-q', 'work');
  return root;
}

test('changedFiles lists what the branch changed, not files only the base gained', () => {
  assert.deepEqual(changedFiles(divergedRepo(), 'main'), ['branch.js']);
});

test('changedFiles throws when the base ref does not resolve', () => {
  assert.throws(() => changedFiles(divergedRepo(), 'no-such-ref'), /no-such-ref/);
});
