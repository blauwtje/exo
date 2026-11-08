export const FLOW_LARGE_EXTRA = [
  {
    title: 'Add reverseWords',
    subject: 'add reverseWords',
    behavior: 'reverseWords(text) returns the space-separated words of text in reverse order, joined with single spaces',
    module: 'src/reverse-words.js',
    test: 'src/reverse-words.test.js',
    code: [
      'export function reverseWords(text) {',
      "  const words = text.split(' ');",
      "  return words.reverse().join(' ');",
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { reverseWords } from './reverse-words.js';",
      '',
      "test('reverseWords reverses the word order', () => {",
      "  assert.equal(reverseWords('one two three'), 'three two one');",
      '});'
    ]
  },
  {
    title: 'Add capitalize',
    subject: 'add capitalize',
    behavior: 'capitalize(text) uppercases the first character of text and leaves the rest unchanged',
    module: 'src/capitalize.js',
    test: 'src/capitalize.test.js',
    code: [
      'export function capitalize(text) {',
      '  return text.charAt(0).toUpperCase() + text.slice(1);',
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { capitalize } from './capitalize.js';",
      '',
      "test('capitalize uppercases the first character', () => {",
      "  assert.equal(capitalize('hello'), 'Hello');",
      '});'
    ]
  }
];
