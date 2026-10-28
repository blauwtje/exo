import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { gradeRepair, loadFixtures } from '../benchmarks/review-replay.mjs';

const FIXTURES = loadFixtures();

function parts(range) {
  const [start, end = start] = range.split('-').map(Number);
  return { start, end };
}

function diffOf(ranges) {
  const hunks = ranges.map(({ path: file, range }) => {
    const { start, end } = parts(range);
    const count = end - start + 1;
    return `--- a/${file}\n+++ b/${file}\n@@ -${start},${count} +${start},${count} @@`;
  });
  return hunks.join('\n');
}

function findingsOf(ranges) {
  return ranges.map(({ path: file, range }) => `${file}:${range} defect: reference range; fix`).join('\n');
}

function references(fixture) {
  return JSON.parse(fs.readFileSync(path.join(fixture.dir, 'references.json'), 'utf8'));
}

function grade(fixture, ranges) {
  return gradeRepair(fixture.plants, findingsOf(ranges), diffOf(ranges));
}

test('every replay task ships a good and a bad reference repair', () => {
  assert.ok(FIXTURES.length > 0);
  for (const fixture of FIXTURES) {
    const { good, bad } = references(fixture);
    assert.ok(good.length > 0, `${fixture.id} good`);
    assert.ok(bad.length > 0, `${fixture.id} bad`);
  }
});

for (const fixture of FIXTURES) {
  test(`${fixture.id}: the good reference fixes every plant with no false fix`, () => {
    const grading = grade(fixture, references(fixture).good);
    assert.equal(grading.fixed, grading.planted);
    assert.equal(grading.falseFix, 0);
  });

  test(`${fixture.id}: the bad reference misses a plant and fixes outside every plant`, () => {
    const grading = grade(fixture, references(fixture).bad);
    assert.ok(grading.fixed < grading.planted);
    assert.ok(grading.falseFix > 0);
  });
}
