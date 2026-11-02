import assert from 'node:assert/strict';
import test from 'node:test';
import { resultsMarkdown } from '../benchmarks/sweep-score.mjs';
import { SWEEP_MODELS } from '../benchmarks/sweep-cells.mjs';

const META = { date: '2026-01-01', claudeVersion: '1', node: '1' };

function record(overrides) {
  return { id: 'cell', kind: 'review', variant: 'control', model: 'opus', effort: 'high', timedOut: false, wallMs: 1000, costUsd: null, tokens: null, defectsFound: null, falseAlarms: 0, detail: 'd', ...overrides };
}

const control = (index, falseAlarms, extra = {}) => record({ id: `control-${index}`, falseAlarms, ...extra });

test('the false-alarm rate prints a 95% CI over control cells, and no SE for one cell', () => {
  const many = resultsMarkdown(META, [control(1, 0), control(2, 1), control(3, 0), control(4, 0)]);
  assert.match(many, /1\/4 control branches, 25% \(95% CI 0% to 74%, n=4\)/);
  const one = resultsMarkdown(META, [control(1, 1)]);
  assert.match(one, /1\/1 control branches, 100%, no SE \(n=1\)/);
});

test('a timed-out control cell is left out of the false-alarm rate and counted as unmeasured', () => {
  const text = resultsMarkdown(META, [control(1, 0), control(2, 0), control(3, 5, { timedOut: true })]);
  assert.match(text, /0\/2 control branches/);
  assert.match(text, /Unmeasured: 1 control cells left no report or timed out/);
});

const replay = (index, overrides) => record({ id: `replay-${index}`, kind: 'replay', variant: null, hits: 1, truth: 2, extra: 1, ...overrides });

test('the replay hit rate counts a cell with no report or a timeout as zero hits and prints the CI and the failed count', () => {
  const text = resultsMarkdown(META, [replay(1, { hits: 2 }), replay(2, { hits: 1 }), replay(3, { hits: null, extra: null }), replay(4, { hits: 2, timedOut: true })]);
  assert.match(text, /\| opus \| 4 \| 3\/8 \| 38% \(95% CI 0% to 84%, n=4\) \| 2 \| 2 \(excl\. 2 cells\) \|/);
});

const plan = (model, effort, defectsFound, tokens) => record({ id: `plan-${model}-${effort}`, kind: 'plan', variant: null, model, effort, defectsFound, tokens });

test('Fable against Opus from one plan task prints no SE and never a win', () => {
  const text = resultsMarkdown(META, [plan(SWEEP_MODELS.opus, 'high', 3, 100), plan(SWEEP_MODELS.fable, 'high', 0, 50), plan(SWEEP_MODELS.fable, 'low', 1, 40)]);
  assert.match(text, /Fable 5\.1 at high against Opus 5\.5 at high: no SE/);
  assert.doesNotMatch(text, /beats/);
});

test('a plan cell that wrote no plan is counted out of the plan line', () => {
  const text = resultsMarkdown(META, [plan(SWEEP_MODELS.opus, 'high', 3, 100), plan(SWEEP_MODELS.fable, 'high', null, null)]);
  assert.match(text, /1 cells wrote no plan and are left out/);
});

const task = (name, model, defects) => ({ ...plan(model, 'high', defects, 10), task: name });
const pairedCells = (fableA, fableB) => [task('a', SWEEP_MODELS.opus, 4), task('b', SWEEP_MODELS.opus, 6), task('a', SWEEP_MODELS.fable, fableA), task('b', SWEEP_MODELS.fable, fableB)];

test('Fable against Opus paired over two plan tasks names a verdict when the CI clears zero', () => {
  const text = resultsMarkdown(META, pairedCells(1, 2));
  assert.match(text, /-3\.50 breaches \(95% CI -4\.48 to -2\.52, paired over 2 tasks\), fewer breaches/);
});

test('Fable against Opus paired over two plan tasks says crosses zero when the CI holds zero', () => {
  const text = resultsMarkdown(META, pairedCells(1, 9));
  assert.match(text, /paired over 2 tasks\), crosses zero/);
});
