import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FETCH_UNIT, fetchFields } from '../lib/brief-fetches.mjs';

const sources = readFileSync(new URL('../skills/spec/references/sources.md', import.meta.url), 'utf8');

test('Fetches is the thread count divided by the call limit, rounded up', () => {
  assert.match(sources, /divided by .*--limit.*rounded up/is);
});

test('a raise sent by the dispatching orchestrator is valid and obeyed', () => {
  assert.match(sources, /raise.*orchestrator.*obey/is);
});

test('a stated Fetches count is read as given', () => {
  assert.equal(fetchFields('prompt', '3', true).count, 3);
});

test('inferred fetches divide the distinct thread URLs by the call limit, rounded up', () => {
  const urls = Array.from({ length: 2 * FETCH_UNIT }, (_, i) => `https://www.reddit.com/r/a/comments/${i}`).join(' ');
  assert.equal(fetchFields(urls, undefined, true).count, 2);
});

for (const form of ['node "/a/search.mjs" --source reddit --query x', 'search.mjs --run r1 --source reddit --query x', 'Sources: reddit', 'search.mjs --source hn,reddit --query x']) {
  test(`the reddit route is recognised in the form ${form}`, () => {
    assert.equal(fetchFields(form, '2', true).callUnit, FETCH_UNIT);
  });
}

test('a non-reddit brief sizes a fetch as one page', () => {
  assert.equal(fetchFields('search.mjs --source hn --query x', '2', true).callUnit, 1);
});

for (const form of ['node search.mjs --source "reddit" --query x', "search.mjs --source 'reddit,web' --query x", 'search.mjs --source="reddit" --query x']) {
  test(`the reddit route is recognised with a quoted source ${form}`, () => {
    assert.equal(fetchFields(form, '2', true).callUnit, FETCH_UNIT);
  });
}

test('a Sources line that excludes reddit sizes a fetch as one page', () => {
  assert.equal(fetchFields('Sources: web, not reddit', '2', true).callUnit, 1);
});

for (const form of ['node search.mjs --source "web, reddit" --query x', "search.mjs --source 'reddit, web' --query x"]) {
  test(`the reddit route is recognised with spaces inside quotes ${form}`, () => {
    assert.equal(fetchFields(form, '2', true).callUnit, FETCH_UNIT);
  });
}

test('an unquoted source value ends at the first space', () => {
  assert.equal(fetchFields('search.mjs --source web reddit --query x', '2', true).callUnit, 1);
});
