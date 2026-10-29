import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { run } from '../src/cli.mjs';

const tasks = [
  { id: 1, status: 'open', title: 'a' },
  { id: 2, status: 'done', title: 'b' },
  { id: 3, status: 'open', title: 'c' },
  { id: 4, status: 'open', title: 'd' },
];

test('limit keeps the first n lines', () => {
  assert.equal(run(['list', '--limit', '2'], tasks), '1\topen\ta\n2\tdone\tb');
});

test('limit applies after the status filter', () => {
  assert.equal(run(['list', '--status', 'open', '--limit', '2'], tasks), '1\topen\ta\n3\topen\tc');
});

test('option order does not matter', () => {
  assert.equal(run(['list', '--limit', '1', '--status', 'open'], tasks), '1\topen\ta');
});

test('limit above the count prints everything', () => {
  assert.equal(run(['list', '--limit', '99'], tasks).split('\n').length, 4);
});

test('no limit prints everything', () => {
  assert.equal(run(['list'], tasks).split('\n').length, 4);
});

test('zero limit is rejected', () => {
  assert.throws(() => run(['list', '--limit', '0'], tasks), /--limit needs a positive integer/);
});

test('non-numeric limit is rejected', () => {
  assert.throws(() => run(['list', '--limit', 'abc'], tasks), /--limit needs a positive integer/);
});

test('fractional limit is rejected', () => {
  assert.throws(() => run(['list', '--limit', '1.5'], tasks), /--limit needs a positive integer/);
});

test('limit without a value is rejected', () => {
  assert.throws(() => run(['list', '--limit'], tasks), /--limit needs a positive integer/);
});

test('readme documents the option', () => {
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /--limit/);
});
