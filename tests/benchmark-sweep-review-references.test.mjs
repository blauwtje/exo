import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { defectRange } from '../benchmarks/sweep-fixtures.mjs';
import { overlaps, parseReview } from '../benchmarks/sweep-score.mjs';
import { measureReview } from '../benchmarks/sweep.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';

const REFERENCES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'review-judges', 'references.json');
const ROWS = JSON.parse(fs.readFileSync(REFERENCES, 'utf8'));

function fixFindingsOutside(review, task) {
  const range = defectRange(task);
  return review.findings.filter((finding) => finding.action === 'fix' && !overlaps(finding, range));
}

test('every review-set task ships exactly one good and one bad reference review', () => {
  assert.deepEqual(ROWS.map((row) => row.task), SAFE_TASKS.map((task) => task.id));
  for (const row of ROWS) {
    assert.ok(row.good.length > 0, `${row.task} good`);
    assert.ok(row.bad.length > 0, `${row.task} bad`);
  }
});

for (const task of SAFE_TASKS) {
  const row = ROWS.find((candidate) => candidate.task === task.id);

  test(`${task.id}: the good review hits the defect with no false alarm`, async () => {
    const review = parseReview(row.good);
    const measured = await measureReview({ variant: 'seeded', task }, null, review);
    assert.ok(measured.hits >= 1, `hits ${measured.hits}`);
    assert.equal(fixFindingsOutside(review, task).length, 0);
  });

  test(`${task.id}: the bad review misses the defect and raises a false alarm`, async () => {
    const review = parseReview(row.bad);
    const measured = await measureReview({ variant: 'seeded', task }, null, review);
    assert.equal(measured.hits, 0);
    assert.ok(fixFindingsOutside(review, task).length > 0);
  });
}
