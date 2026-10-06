import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from '../src/csv.mjs';

test('parses a header and rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n3,4\n'), [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('quoted fields keep commas and doubled quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"1,5","say ""hi"""\r\n'), [{ a: '1,5', b: 'say "hi"' }]);
});
