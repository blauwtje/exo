import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkInvisibleUnicode } from '../scripts/checks/invisible-unicode.mjs';
import { createRepository } from '../scripts/lib/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkInvisibleUnicode, createRepository(tree(files)));
}

test('a clean file passes', () => {
  const result = run({ 'a.md': 'plain text\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a zero width space fails with its path, line and code point', () => {
  const result = run({ 'docs/a.md': `one\ntw\u200Bo\n` });
  assert.match(result.detail, /docs\/a\.md:2 U\+200B/);
});

test('a bidi override fails in a file that is not JavaScript', () => {
  const result = run({ 'skills/a/SKILL.md': `text \u202E text\n` });
  assert.match(result.detail, /SKILL\.md:1 U\+202E/);
});

test('a tag character fails', () => {
  const result = run({ 'a.txt': `x\u{E0041}\n` });
  assert.match(result.detail, /a\.txt:1 U\+E0041/);
});

test('a file with a NUL byte is skipped', () => {
  const result = run({ 'a.bin': `\0\u200B` });
  assert.equal(result.ok, true, result.detail);
});

test('a file under a dotted folder is skipped', () => {
  const result = run({ '.github/a.md': `\u200B` });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkInvisibleUnicode, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
