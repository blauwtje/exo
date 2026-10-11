// Parses one rendered exo question and asserts the limits of the shape in
// `skills/route-skills/references/question.md`: a bold title of at most 10
// words (a `1/3 ` progress prefix allowed), at most one 15-word context sentence,
// two or three lettered options of 3-word labels and 8-word text in order, and
// the `Recommended: (A), because` line last, its reason at most 8 words.

import assert from 'node:assert/strict';
import { QUESTION_CAPS } from '../verify/checks/question-options.mjs';

// Parses any letter so a fourth option fails the count, not the blank-line check.
const OPTION = /^- \*\*\(([A-Z])\) ([^*]+)\*\*: (\S.*)$/;
const words = (text) => text.trim().split(/\s+/).length;

/** Asserts that `text`, one rendered question, keeps every limit of the shape. */
export function assertQuestionShape(text) {
  const lines = text.trim().split('\n');
  const title = lines[0].match(/^\*\*(?:\d+\/\d+ )?([^*]+\?)\*\*$/);
  assert.ok(title, `a bold title ending in ?: ${lines[0]}`);
  assert.ok(words(title[1]) <= QUESTION_CAPS.title, `the title runs past 10 words: ${title[1]}`);
  const blank = lines.indexOf('');
  assert.ok(blank > 0, 'a blank line before the options');
  const context = lines.slice(1, blank).join(' ');
  const sentences = context.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
  assert.ok(sentences.length <= 1, `${sentences.length} context sentences: ${context}`);
  for (const sentence of sentences) assert.ok(words(sentence) <= QUESTION_CAPS.context, `the context runs past 15 words: ${sentence}`);
  const options = [];
  let index = blank + 1;
  while (OPTION.test(lines[index] ?? '')) {
    const [, letter, label, body] = lines[index++].match(OPTION);
    assert.ok(words(label) <= QUESTION_CAPS.label, `the label runs past 3 words: ${label}`);
    assert.ok(words(body) <= QUESTION_CAPS.option, `the option text runs past 8 words: ${body}`);
    options.push(letter);
  }
  assert.ok(options.length >= 2 && options.length <= QUESTION_CAPS.label, `${options.length} options`);
  assert.deepEqual(options, ['A', 'B', 'C'].slice(0, options.length), 'options lettered in order from A');
  assert.equal(lines[index], '', 'a blank line after the options');
  assert.equal(index + 2, lines.length, 'the recommendation is the last line');
  const reason = lines.at(-1).match(/^Recommended: \(A\), because (\S.*)$/);
  assert.ok(reason, `the recommendation line: ${lines.at(-1)}`);
  assert.ok(words(reason[1]) <= QUESTION_CAPS.reason, `the reason runs past 8 words: ${reason[1]}`);
}
