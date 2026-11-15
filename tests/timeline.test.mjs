import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';
import { appendTimeline, timelineLines } from '../lib/timeline.mjs';

test('events append one line each with epoch seconds, name and task', async () => {
  const root = tempDir('ui-design-test-');
  appendTimeline(root, { event: 'dispatched', task: '2', at: 100 });
  appendTimeline(root, { event: 'gate-step-start', at: 101 });
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'timeline.log'), 'utf8'), '100 dispatched 2\n101 gate-step-start -\n');
  assert.deepEqual(timelineLines(root), ['Task 2 time: build -, wait -, land -', 'Idle total: 0s']);
});

test('timeline lines give build, wait and land per task and the idle total', async () => {
  const root = tempDir('ui-design-test-');
  [['dispatched', 100], ['wait-start', 101], ['report-written', 160], ['wait-end', 170], ['landed', 190]].forEach(([event, at]) => appendTimeline(root, { event, task: '3', at }));
  assert.deepEqual(timelineLines(root), ['Task 3 time: build 60s, wait 69s, land 30s', 'Idle total: 10s']);
});
