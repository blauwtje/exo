// Parses one rendered exo question and asserts the limits of the shape in
// `skills/route-skills/references/question.md`: a bold title of at most about
// ten words, at most two context sentences, two or three lettered options in
// order, and the `Recommended: (A), because` line last.

import assert from 'node:assert/strict';

// Parses any letter so a fourth option fails the count, not the blank-line check.
const OPTION = /^- \*\*\(([A-Z])\) [^*]+\*\*: \S/;

/** Asserts that `text`, one rendered question, keeps every limit of the shape. */
export function assertQuestionShape(text) {
  const lines = text.trim().split('\n');
  const title = lines[0].match(/^\*\*([^*]+\?)\*\*$/);
  assert.ok(title, `a bold title ending in ?: ${lines[0]}`);
  assert.ok(title[1].split(/\s+/).length <= 12, `the title runs past about ten words: ${title[1]}`);
  const blank = lines.indexOf('');
  assert.ok(blank > 0, 'a blank line before the options');
  const context = lines.slice(1, blank).join(' ');
  const sentences = context.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
  assert.ok(sentences.length <= 2, `${sentences.length} context sentences: ${context}`);
  const options = [];
  let index = blank + 1;
  while (OPTION.test(lines[index] ?? '')) options.push(lines[index++].match(OPTION)[1]);
  assert.ok(options.length >= 2 && options.length <= 3, `${options.length} options`);
  assert.deepEqual(options, ['A', 'B', 'C'].slice(0, options.length), 'options lettered in order from A');
  assert.equal(lines[index], '', 'a blank line after the options');
  assert.equal(index + 2, lines.length, 'the recommendation is the last line');
  assert.match(lines.at(-1), /^Recommended: \(A\), because \S/);
}
