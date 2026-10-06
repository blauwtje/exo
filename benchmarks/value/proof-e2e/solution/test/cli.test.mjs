import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.mjs';

test('defaults', () => {
  assert.deepEqual(parseArgs(['data.csv']), { file: 'data.csv', sort: 'total', top: null, category: null, format: 'text', help: false });
});

test('value options take a space or an equals sign', () => {
  assert.equal(parseArgs(['data.csv', '--sort', 'name']).sort, 'name');
  assert.equal(parseArgs(['--sort=name', 'data.csv']).sort, 'name');
  assert.equal(parseArgs(['data.csv', '--top=3']).top, 3);
  assert.equal(parseArgs(['--category', 'Travel', '-']).file, '-');
  assert.equal(parseArgs(['data.csv', '--format', 'json']).format, 'json');
  assert.equal(parseArgs(['--format=json', 'data.csv']).format, 'json');
});

test('rejects bad values and unknown options', () => {
  assert.throws(() => parseArgs(['a.csv', '--sort', 'size']), /--sort must be one of total, name/);
  assert.throws(() => parseArgs(['a.csv', '--top', '0']), /--top must be a positive integer/);
  assert.throws(() => parseArgs(['a.csv', '--format', 'xml']), /--format must be one of text, json/);
  assert.throws(() => parseArgs(['a.csv', '--nope']), /unknown option --nope/);
  assert.throws(() => parseArgs(['a.csv', 'b.csv']), /unexpected argument b.csv/);
  assert.throws(() => parseArgs(['a.csv', '--sort']), /--sort needs a value/);
});
