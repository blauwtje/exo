import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripArticles } from '#terse-display';
import { scoreProse } from '#prose-density';

const strip = (text, inFence = false) => stripArticles(text, inFence);

test('removes lowercase articles and keeps the rest of the line', () => {
  assert.equal(strip('Fix the array and an index in a loop.').text, 'Fix array and index in loop.');
});

test('capitalizes the next word when the article opened a sentence', () => {
  assert.equal(strip('The array is sorted. A loop runs.').text, 'Array is sorted. Loop runs.');
  assert.equal(strip('- The array grows').text, '- Array grows');
});

test('keeps a capital A mid-sentence and the idioms', () => {
  assert.equal(strip('Compare Plan A with Plan B').text, 'Compare Plan A with Plan B');
  assert.equal(
    strip('It took a while, a few tries, a little luck, a bit, a lot, a couple.').text,
    'It took a while, a few tries, a little luck, a bit, a lot, a couple.',
  );
});

test('keeps an article with no word after it', () => {
  assert.equal(strip('Read the').text, 'Read the');
  assert.equal(strip('Read the.').text, 'Read the.');
});

test('leaves code, quotes, urls, blockquotes, tables and questions unchanged', () => {
  const lines = [
    'Run `the tool` now',
    'Say "the word" twice',
    'See https://example.com/the/path',
    '> the quoted line',
    '| the | cell |',
    'Do you want the array sorted?',
  ];
  for (const line of lines) assert.equal(strip(line).text, line);
});

test('filters a question that asks the user nothing and keeps one that does', () => {
  assert.equal(strip('It needs a decision: does the call count toward the old window?').text, 'It needs decision: does call count toward old window?');
  assert.equal(strip('The fix is in. Do you want the patch?').text, 'Fix is in. Do you want the patch?');
});

test('leaves a tilde fence unchanged', () => {
  assert.equal(strip('~~~\nthe code runs\n~~~').text, '~~~\nthe code runs\n~~~');
});

test('returns a line that already holds the placeholder unchanged', () => {
  const line = 'Icon \u{E000} marks the file.';
  assert.equal(strip(line).text, line);
});

test('strips around protected spans and keeps them intact', () => {
  assert.equal(strip('Call the `run` helper in the "main" file').text, 'Call `run` helper in "main" file');
});

test('removes an article before a path token but keeps the path', () => {
  assert.equal(strip('Edit the lib/a.mjs file').text, 'Edit lib/a.mjs file');
});

test('tracks fences across deltas', () => {
  const opened = strip('Use the tool:\n```js\nconst x = the;\n');
  assert.equal(opened.text, 'Use tool:\n```js\nconst x = the;\n');
  assert.equal(opened.inFence, true);
  const inside = strip('the inside line\n', true);
  assert.equal(inside.text, 'the inside line\n');
  assert.equal(inside.inFence, true);
  const closed = strip('```\nThe end of the day', true);
  assert.equal(closed.text, '```\nEnd of day');
  assert.equal(closed.inFence, false);
});

test('filtered prose scores at or under the limit', () => {
  const text = 'The array holds the items. We read an item from the array and pass the value to a function.';
  assert.ok(scoreProse(text).articleRate > 2);
  assert.equal(scoreProse(strip(text).text).articleRate, 0);
});

test('handles an empty delta', () => {
  assert.deepEqual(strip(''), { text: '', inFence: false });
});
