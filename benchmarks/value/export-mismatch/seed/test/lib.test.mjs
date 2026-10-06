import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCsv, parseCsv } from '../src/lib/csv.mjs';
import { isMonth, localDate } from '../src/lib/dates.mjs';
import { convertMinor, formatMinor, parseMinor, roundHalfAway } from '../src/lib/money.mjs';

test('parseCsv reads quoted fields and doubled quotes', () => {
  const rows = parseCsv('id,name\nC1,"Acme, Inc"\nC2,"say ""hi"""\n');
  assert.deepEqual(rows, [{ id: 'C1', name: 'Acme, Inc' }, { id: 'C2', name: 'say "hi"' }]);
});

test('parseCsv accepts CRLF and a missing final newline', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n3,4'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('formatCsv quotes only the fields that need it', () => {
  assert.equal(formatCsv(['a', 'b'], [['x', 'y,z'], ['"q"', 'plain']]), 'a,b\nx,"y,z"\n"""q""",plain\n');
});

test('parseMinor and formatMinor round-trip', () => {
  assert.equal(parseMinor('129.00'), 12900);
  assert.equal(parseMinor('-12.5'), -1250);
  assert.equal(parseMinor('7'), 700);
  assert.equal(formatMinor(-1250), '-12.50');
  assert.equal(formatMinor(123456789, { grouping: true }), '1,234,567.89');
  assert.throws(() => parseMinor('12,50'), /not an amount/);
});

test('rounding goes half away from zero', () => {
  assert.equal(roundHalfAway(2.5), 3);
  assert.equal(roundHalfAway(-2.5), -3);
  assert.equal(convertMinor(1001, 0.5), 501);
  assert.equal(convertMinor(-1001, 0.5), -501);
});

test('localDate follows the time zone', () => {
  assert.equal(localDate('2026-03-05T23:30:00Z', 'Asia/Tokyo'), '2026-03-06');
  assert.equal(localDate('2026-03-06T03:30:00Z', 'America/Los_Angeles'), '2026-03-05');
  assert.equal(localDate('2026-03-05T12:00:00Z', 'Europe/Berlin'), '2026-03-05');
});

test('isMonth accepts YYYY-MM only', () => {
  assert.equal(isMonth('2026-03'), true);
  assert.equal(isMonth('2026-13'), false);
  assert.equal(isMonth('2026-3'), false);
});
