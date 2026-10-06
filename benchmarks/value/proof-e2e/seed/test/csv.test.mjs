import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.mjs';

test('reads a header row into objects', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [{ a: '1', b: '2' }]);
});

test('keeps commas and doubled quotes inside quoted fields', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [{ a: 'x, y', b: 'say "hi"' }]);
});

test('handles CRLF line ends and a BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n3,4\r\n'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('skips blank lines and fills missing trailing fields', () => {
  assert.deepEqual(parseCsv('a,b\n\n1\n'), [{ a: '1', b: '' }]);
});
