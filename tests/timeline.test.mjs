import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fixture } from './harness.mjs';
import { appendTimeline, readTimeline, taskOfReport, timelineFile, timelineLines } from '../lib/timeline.mjs';

test('events append one line each with epoch seconds, name and task', async () => {
  const root = await fixture();
  appendTimeline(root, 'dispatched', '2', 100);
  appendTimeline(root, 'gate-step-start', '-', 101);
  assert.equal(fs.readFileSync(timelineFile(root), 'utf8'), '100 dispatched 2\n101 gate-step-start -\n');
  assert.deepEqual(readTimeline(root)[1], { at: 101, event: 'gate-step-start', task: '-' });
});

test('a report path names its task', () => {
  assert.equal(taskOfReport('/x/.exo/implementer-7.md'), '7');
  assert.equal(taskOfReport('/x/other.md'), '-');
});

test('timeline lines give build, wait and land per task and the idle total', async () => {
  const root = await fixture();
  [['dispatched', 100], ['wait-start', 101], ['report-written', 160], ['wait-end', 170], ['landed', 190]].forEach(([event, at]) => appendTimeline(root, event, '3', at));
  assert.deepEqual(timelineLines(root), ['Task 3 time: build 60s, wait 69s, land 30s', 'Idle total: 10s']);
});
