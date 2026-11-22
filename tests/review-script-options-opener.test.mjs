import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionNames } from '../verify/checks/script-options.mjs';

test('a parseFlags first argument with a call and parentheses still counts its options', () => {
  assert.deepEqual(optionNames("parseFlags(process.argv.slice(2), { plan: 'value', extra: 'boolean' });"), ['extra', 'plan']);
});

test('a parseFlags first argument with an arrow function and commas still counts its options', () => {
  assert.deepEqual(optionNames("parseFlags(argv.filter((_, index) => index !== at), { task: 'value', force: 'boolean' });"), ['force', 'task']);
});
