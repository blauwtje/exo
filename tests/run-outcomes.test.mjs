import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RUN_OUTCOMES, outcome, outcomeLine, parkQuestion } from '../lib/run-outcomes.mjs';

const ACTIONS = ['continue', 'repair', 'amend', 'park', 'stop'];

test('every row has its own kind, one known action and a single Then: line', () => {
  for (const [kind, row] of Object.entries(RUN_OUTCOMES)) {
    assert.equal(row.kind, kind);
    assert.ok(ACTIONS.includes(row.action), kind);
    assert.match(row.line, /^Then: \S/, kind);
    assert.ok(!row.line.includes('\n'), kind);
  }
});

test('the table is frozen and an unknown kind throws', () => {
  assert.ok(Object.isFrozen(RUN_OUTCOMES));
  assert.ok(Object.isFrozen(RUN_OUTCOMES.lock));
  assert.throws(() => outcome('mystery'), /no run outcome for 'mystery'/);
});

test('a gate fail repairs, an unplanned path amends, a question parks and only the bound stops', () => {
  assert.equal(outcome('gate fail').action, 'repair');
  assert.equal(outcome('outside Files').action, 'amend');
  assert.equal(outcome('question').action, 'park');
  assert.equal(outcome('repair bound').action, 'stop');
});

test('the repair line reads its cap from the fix kind', () => {
  const repairs = JSON.parse(fs.readFileSync(new URL('../lib/loop-kinds.json', import.meta.url), 'utf8')).fix.cap - 1;
  assert.match(outcomeLine('proof failed'), new RegExp(`at most ${repairs} times`));
  assert.match(outcomeLine('findings'), new RegExp(`at most ${repairs} times`));
});

test('parkQuestion writes one question file under .exo/questions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'park-'));
  const file = parkQuestion({ root, task: 4, question: 'Which store?' });
  assert.equal(file, path.join(root, '.exo', 'questions', 'task-4.md'));
  assert.equal(fs.readFileSync(file, 'utf8'), 'Which store?\n');
});

test('a recurring finding stops and an unread file repairs by a re-read', () => {
  assert.equal(outcome('recurring finding').action, 'stop');
  assert.equal(outcome('unread file').action, 'repair');
});

test('a discarded fix continues and the spent review budget stops', () => {
  assert.equal(outcome('fix discarded').action, 'continue');
  assert.equal(outcome('review budget').action, 'stop');
});
