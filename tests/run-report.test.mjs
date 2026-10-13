import assert from 'node:assert/strict';
import { test } from 'node:test';
import { averageLines, clock, landedLine, startLine, taskSubject, wallClock } from '../skills/build/scripts/run-report.mjs';

test('wallClock gives local HH:MM:SS and clock stays as it was', () => {
  assert.equal(wallClock(new Date(2026, 9, 13, 9, 5, 7)), '09:05:07');
  assert.equal(clock(65000), '01:05');
});

test('taskSubject drops the type(scope) prefix and keeps a heading without one', () => {
  assert.equal(taskSubject('feat(run): format log lines'), 'format log lines');
  assert.equal(taskSubject('fix: stop a hang'), 'stop a hang');
  assert.equal(taskSubject('format log lines'), 'format log lines');
});

test('startLine and landedLine follow the log format', () => {
  assert.equal(startLine({ number: 3, subject: 'format log lines', model: 'sonnet', effort: 'medium' }), 'task 3 start: format log lines · sonnet medium');
  assert.equal(landedLine({ number: 3, sha: 'abcdef0123456', ms: 95400, turns: 12, tokens: 41500, cost: 0.5 }), 'task 3 landed abcdef0 · 95s · 12 turns · 42k tokens · $0.50');
});

test('averageLines gives averages per landed task and totals, none for no tasks', () => {
  const landed = [
    { ms: 60000, turns: 10, tokens: 40000, cost: 0.5 },
    { ms: 120000, turns: 20, tokens: 80000, cost: 1.5 },
  ];
  assert.deepEqual(averageLines(landed), ['average per task: 90s · 15 turns · 60k tokens · $1.00', 'total: 120k tokens · $2.00']);
  assert.deepEqual(averageLines([]), []);
});
