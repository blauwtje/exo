import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/learn/scripts/lessons.mjs', import.meta.url));

const GOOD_NOTE = [
  '---',
  'name: Run tests first',
  'description: before any commit, so a failure shows early',
  'type: feedback',
  'seen: 2026-11-01, 2026-11-10',
  '---',
  'Run the tests first.',
  'Why: a skipped run hid a failure.',
  'How to apply: before every commit.',
  ''
].join('\n');

function store(notes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-'));
  for (const [name, text] of Object.entries(notes)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

function indexOf(names) {
  return names.map((name) => `- [${name}](${name}.md) — when it applies\n`).join('');
}

function check(dir) {
  return spawnSync(process.execPath, [script, 'check', '--dir', dir], { encoding: 'utf8' });
}

test('a clean store prints its count and exits 0', () => {
  const dir = store({ 'a.md': GOOD_NOTE, 'b.md': GOOD_NOTE, 'index.md': indexOf(['a', 'b']) });
  const result = check(dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'lessons: 2 of 15');
});

test('a missing default directory passes and a missing explicit one fails', () => {
  const missing = path.join(os.tmpdir(), 'learn-lessons-missing-dir');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-cwd-'));
  assert.equal(spawnSync(process.execPath, [script, 'check'], { cwd, encoding: 'utf8' }).status, 0);
  const result = check(missing);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no such directory/);
});

test('16 notes fail', () => {
  const names = Array.from({ length: 16 }, (_, index) => `n${index}`);
  const notes = Object.fromEntries(names.map((name) => [`${name}.md`, GOOD_NOTE]));
  const result = check(store({ ...notes, 'index.md': indexOf(names) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /16 notes/);
});

test('a note without Why fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace(/Why:.*\n/, ''), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*Why:/);
});

test('a seen line without a date fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace(/seen:.*\n/, 'seen: last week\n'), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*date/);
});

test('a note without frontmatter fails', () => {
  const result = check(store({ 'a.md': 'Run the tests.\nWhy: x\nHow to apply: y\n', 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*frontmatter/);
});

test('a note with a wrong type fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace('feedback', 'user'), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*type/);
});

test('a note without a rule line fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace('Run the tests first.\n', ''), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*rule/);
});

test('a note over 12 lines fails', () => {
  const result = check(store({ 'a.md': `${GOOD_NOTE}1\n2\n3\n4\n5\n6\n`, 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*lines/);
});

test('an index link to a missing note fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE, 'index.md': indexOf(['a', 'ghost']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /index\.md.*ghost\.md/);
});

test('an index that misses a note fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE, 'b.md': GOOD_NOTE, 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /index\.md.*b\.md/);
});
