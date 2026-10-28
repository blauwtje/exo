import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, incompleteReason, metricDeltas, runMetrics } from '../benchmarks/lean-gates-metrics.mjs';

function referenceRun(out, name, meta) {
  const directory = join(out, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'meta.json'), JSON.stringify(meta));
  return directory;
}

function measure(directory) {
  return runMetrics(directory, { recheck: false });
}

test('a good reference run is complete and carries its harness wall time', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const run = measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' }));
  assert.equal(run.incomplete, false);
  assert.equal(run.incompleteReason, null);
  assert.deepEqual(run.wall, { ms: 60000, source: 'meta' });
});

test('a bad reference run is incomplete and leaves the aggregate', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-metrics-'));
  const good = measure(referenceRun(out, '01-new', { exitCode: 0, wallMs: 60000, version: 'new' }));
  const bad = measure(referenceRun(out, '02-new', { exitCode: null, timedOut: true, wallMs: 900000, version: 'new' }));
  assert.equal(bad.incomplete, true);
  assert.equal(bad.incompleteReason, 'timed out');
  assert.deepEqual(aggregate([good, bad]).new.excluded.incomplete, ['02-new']);
  assert.equal(aggregate([good, bad]).new.wallMs.median, 60000);
});

test('incompleteReason names a timeout, a signal and an exit code', () => {
  assert.equal(incompleteReason({ exitCode: 0 }), null);
  assert.equal(incompleteReason({ timedOut: true, exitCode: 0 }), 'timed out');
  assert.equal(incompleteReason({ signal: 'SIGTERM', exitCode: null }), 'signal SIGTERM');
  assert.equal(incompleteReason({ exitCode: 3 }), 'exit 3');
  assert.equal(incompleteReason({}), 'no exit code');
});

test('metricDeltas prints the median change per version and metric against a baseline', () => {
  const stats = (median) => ({ runs: ['a'], excluded: {}, wallMs: { median }, findings: { median: null } });
  const lines = metricDeltas({ aggregate: { new: stats(45000) } }, { aggregate: { new: stats(60000), old: stats(1) } });
  assert.deepEqual(lines, ['new wallMs: 60000 -> 45000 (-15000)']);
});
