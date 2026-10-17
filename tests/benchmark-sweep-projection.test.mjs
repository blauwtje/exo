import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { projectSweep } from '../benchmarks/sweep-projection.mjs';

function writeRecord(runsRoot, run, record) {
  const directory = path.join(runsRoot, run, record.id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(record));
}

test('two past records of one id average and an id with none counts unknown', () => {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sweep-projection-'));
  try {
    writeRecord(runsRoot, '2026-01-01-sweep', { id: 'review-a', costUsd: 1, wallMs: 60000 });
    writeRecord(runsRoot, '2026-01-02-sweep', { id: 'review-a', costUsd: 3, wallMs: 180000 });
    const projection = projectSweep(['review-a', 'review-b'], runsRoot);
    assert.deepEqual(projection, { costUsd: 2, wallMs: 120000, fromRecords: 1, unknown: 1, unreadable: 0 });
  } finally {
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }
});

test('an unreadable record.json is counted, not dropped silently', () => {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sweep-projection-'));
  try {
    writeRecord(runsRoot, '2026-01-01-sweep', { id: 'review-a', costUsd: 1, wallMs: 60000 });
    const broken = path.join(runsRoot, '2026-01-02-sweep', 'review-a');
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, 'record.json'), '{not json');
    assert.equal(projectSweep(['review-a'], runsRoot).unreadable, 1);
  } finally {
    fs.rmSync(runsRoot, { recursive: true, force: true });
  }
});
