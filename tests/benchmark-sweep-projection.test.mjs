import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { projectSweep, sweepProjectionLine } from '../benchmarks/sweep-projection.mjs';
import { tempDir } from './harness.mjs';

function writeRecord(runsRoot, run, record) {
  const directory = path.join(runsRoot, run, record.id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(record));
}

test('two past records of one id average and an id with none counts unknown', () => {
  const runsRoot = tempDir('exo-sweep-projection-');
  writeRecord(runsRoot, '2026-01-01-sweep', { id: 'review-a', costUsd: 1, wallMs: 60000 });
  writeRecord(runsRoot, '2026-01-02-sweep', { id: 'review-a', costUsd: 3, wallMs: 180000 });
  const projection = projectSweep(['review-a', 'review-b'], runsRoot);
  assert.deepEqual(projection, { costUsd: 2, wallMs: 120000, fromRecords: 1, unknown: 1, costUnknown: 0, unreadable: 0 });
});

test('the sweep line says unknown, at least, or neither by what the past records hold', () => {
  const runsRoot = tempDir('exo-sweep-projection-');
  const none = sweepProjectionLine(projectSweep(['a', 'b', 'c'], runsRoot), 3);
  assert.equal(none, 'projected cost and time unknown: none of the 3 cells has a past record');
  writeRecord(runsRoot, '2026-01-01-sweep', { id: 'a', costUsd: 1, wallMs: 60000 });
  const some = sweepProjectionLine(projectSweep(['a', 'b'], runsRoot), 2);
  assert.match(some, /^projected at least \$1\.00 and at least 1\.0 min/);
  const all = sweepProjectionLine(projectSweep(['a'], runsRoot), 1);
  assert.doesNotMatch(all, /at least/);
  writeRecord(runsRoot, '2026-01-01-sweep', { id: 'd', costUsd: null, wallMs: 60000 });
  const noCost = sweepProjectionLine(projectSweep(['d'], runsRoot), 1);
  assert.match(noCost, /^projected at least \$0\.00 and 1\.0 min/);
  assert.match(noCost, /1 have no past cost/);
});

test('an unreadable record.json is counted, not dropped silently', () => {
  const runsRoot = tempDir('exo-sweep-projection-');
  writeRecord(runsRoot, '2026-01-01-sweep', { id: 'review-a', costUsd: 1, wallMs: 60000 });
  const broken = path.join(runsRoot, '2026-01-02-sweep', 'review-a');
  fs.mkdirSync(broken, { recursive: true });
  fs.writeFileSync(path.join(broken, 'record.json'), '{not json');
  assert.equal(projectSweep(['review-a'], runsRoot).unreadable, 1);
});
