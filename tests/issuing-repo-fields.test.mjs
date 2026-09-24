// The `--size` path of `repo-fields.mjs`: a size ladder over max(paths,
// criteria), its fixed estimate, and a priority ranked by shape, --shipped
// or --blocking, against a given options list or the default P0/P1/P2.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { run } from './harness.mjs';
import { sizeFields } from '../skills/issuing/scripts/repo-fields.mjs';

const REPO_FIELDS = fileURLToPath(new URL('../skills/issuing/scripts/repo-fields.mjs', import.meta.url));

const spec = (paths, criteria) => sizeFields({ paths, criteria, shape: 'spec' });

test('size follows max(paths, criteria) on a five-step ladder, 0 counting as XS', () => {
  assert.equal(spec(0, 0).size, 'XS');
  assert.equal(spec(1, 0).size, 'XS');
  assert.equal(spec(0, 2).size, 'S');
  assert.equal(spec(3, 1).size, 'S');
  assert.equal(spec(4, 0).size, 'M');
  assert.equal(spec(2, 6).size, 'M');
  assert.equal(spec(7, 3).size, 'L');
  assert.equal(spec(0, 12).size, 'L');
  assert.equal(spec(13, 0).size, 'XL');
});

test('estimate reads off size on a fixed table', () => {
  assert.equal(spec(1, 0).estimate, 1);
  assert.equal(spec(2, 0).estimate, 2);
  assert.equal(spec(4, 0).estimate, 3);
  assert.equal(spec(7, 0).estimate, 8);
  assert.equal(spec(13, 0).estimate, 13);
});

test('priority ranks report+shipped highest, the other report and spec+blocking middle, a plain spec lowest', () => {
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true }).priority, 'P0');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report' }).priority, 'P1');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true }).priority, 'P1');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec' }).priority, 'P2');
});

test('a 3-option list gives a clean middle option', () => {
  const options = ['High', 'Mid', 'Low'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'High');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'Mid');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'Mid');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'Low');
});

test('a 5-option list picks the option at the floor((n-1)/2) index', () => {
  const options = ['P0', 'P1', 'P2', 'P3', 'P4'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'P0');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'P2');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'P2');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'P4');
});

test('a 2-option list has no distinct middle, so the middle cases fall on the first option', () => {
  const options = ['Now', 'Later'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'Later');
});

test('CLI --size prints one compact JSON line', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--paths', '3', '--criteria', '5', '--shape', 'spec']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, '{"size":"M","estimate":3,"priority":"P2"}\n');
});

test('a bad --shape exits 2 with empty stdout', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--paths', '3', '--criteria', '5', '--shape', 'bogus']);
  assert.equal(outcome.code, 2);
  assert.equal(outcome.stdout, '');
});

test('a missing --paths exits 2 with empty stdout', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--criteria', '5', '--shape', 'spec']);
  assert.equal(outcome.code, 2);
  assert.equal(outcome.stdout, '');
});
