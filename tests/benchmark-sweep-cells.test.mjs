// The sweep's cells: how many `claude -p` calls each set makes, which model and
// effort each cell runs, and that every call names this clone as its plugin.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claudeArguments, selectCells, sweepCells, SWEEP_MODELS } from '../benchmarks/sweep-cells.mjs';
import { FLOW_PLAN, FLOW_REQUEST } from '../benchmarks/sweep-fixtures.mjs';
import { ROOT } from '../benchmarks/tasks.mjs';

const cells = sweepCells();

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

test('the full set makes 39 calls: 30 review, 5 build, 3 plan and 1 flow', () => {
  assert.equal(selectCells(cells, ['all']).length, 39);
  assert.equal(selectCells(cells, ['review']).length, 30);
  assert.equal(selectCells(cells, ['build']).length, 5);
  assert.equal(selectCells(cells, ['plan']).length, 3);
  assert.equal(selectCells(cells, ['flow']).length, 1);
  assert.equal(selectCells(cells, ['plan', 'flow']).length, 4);
});

test('an unknown set name stops the selection', () => {
  assert.throws(() => selectCells(cells, ['reviews']), /unknown cell set reviews/);
});

test('every call names this clone as plugin, the cell model and the cell effort', () => {
  for (const cell of cells) {
    const args = claudeArguments(cell);
    assert.equal(flagValue(args, '--plugin-dir'), ROOT, cell.id);
    assert.equal(flagValue(args, '--model'), cell.model, cell.id);
    assert.match(flagValue(args, '--effort') ?? '', /^(low|medium|high|xhigh)$/, cell.id);
  }
});

test('the cells follow the routing under test', () => {
  const pairs = (kind) => selectCells(cells, [kind]).map((cell) => `${cell.model} ${cell.effort}`);
  assert.deepEqual([...new Set(pairs('review'))], [`${SWEEP_MODELS.opus} low`, `${SWEEP_MODELS.opus} medium`, `${SWEEP_MODELS.opus} high`]);
  assert.deepEqual([...new Set(pairs('build'))], [`${SWEEP_MODELS.sonnet} high`]);
  assert.deepEqual(pairs('plan'), [`${SWEEP_MODELS.opus} high`, `${SWEEP_MODELS.fable} high`, `${SWEEP_MODELS.fable} xhigh`]);
  assert.deepEqual(pairs('flow'), [`${SWEEP_MODELS.sonnet} high`]);
});

test('every fixture is reviewed seeded and as a control at each effort', () => {
  const reviews = selectCells(cells, ['review']);
  assert.equal(reviews.filter((cell) => cell.variant === 'seeded').length, 15);
  assert.equal(reviews.filter((cell) => cell.variant === 'control').length, 15);
  assert.ok(reviews.some((cell) => cell.id === 'review-safe-path-seeded-low' && cell.source === 'seed'));
  assert.ok(reviews.some((cell) => cell.id === 'review-safe-path-control-high' && cell.source === 'solution'));
});

test('a review cell runs the branch reviewer body as its system prompt, without the frontmatter', () => {
  const review = selectCells(cells, ['review'])[0];
  const prompt = flagValue(claudeArguments(review), '--append-system-prompt');
  assert.match(prompt, /You review one branch against the plan/);
  assert.doesNotMatch(prompt, /^---/);
  assert.doesNotMatch(prompt, /effort: medium/);
});

test('plan cells plan the change the flow cell runs from its fixed plan', () => {
  for (const cell of selectCells(cells, ['plan'])) assert.ok(cell.prompt.includes(FLOW_REQUEST), cell.id);
  assert.ok(selectCells(cells, ['flow'])[0].prompt.includes(FLOW_PLAN));
});
