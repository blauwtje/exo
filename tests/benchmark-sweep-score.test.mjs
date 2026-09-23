// Reading what a sweep cell left behind: the reviewer's verdict and counts, the
// plan-spec rules a written plan breaks, drift reports, and the results file's
// false-alarm rate and planning winner.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SWEEP_MODELS } from '../benchmarks/sweep-cells.mjs';
import { flowPlanText } from '../benchmarks/sweep-fixtures.mjs';
import { countDriftReports, lintPlan, parseReview, resultsMarkdown } from '../benchmarks/sweep-score.mjs';

const META = { date: '2026-09-24', claudeVersion: '2.1.280 (Claude Code)', node: 'v24.16.0' };

function record(fields) {
  return {
    variant: null, exitCode: 0, timedOut: false, wallMs: 60_000, costUsd: 0.5, tokens: 1000,
    outputTokens: 100, defectsFound: null, falseAlarms: null, detail: '', ...fields
  };
}

test('parseReview reads the verdict and either order of the Count line', () => {
  assert.deepEqual(parseReview('FIXED\n\nuploads.js:5 defect ...\nCount: 1 defect, 2 hazard, 0 question\n'),
    { verdict: 'FIXED', counts: { defect: 1, hazard: 2, question: 0 } });
  assert.deepEqual(parseReview('**CLEAN**\n**Count:** defect: 0, hazard: 0, question: 1\n'),
    { verdict: 'CLEAN', counts: { defect: 0, hazard: 0, question: 1 } });
  assert.deepEqual(parseReview('BLOCKED\nno count here\n'), { verdict: 'BLOCKED', counts: null });
});

test('the fixed flow plan breaks no checked rule', () => {
  assert.deepEqual(lintPlan(flowPlanText('/tmp/text-helpers')), []);
});

test('lintPlan names each missing section, trailer, Run line and placeholder', () => {
  const plan = [
    '## Goal',
    '',
    '## Tasks',
    '',
    '### Task 1: Add a thing',
    '',
    'Depends on: none',
    '',
    'Step 1: Write it',
    'Expected: it exists',
    '',
    'Step 2: TODO',
    'Run: `npm test`',
    'Expected: pass',
    '',
    'Commit:',
    'git commit -m "feat: add a thing"',
    ''
  ].join('\n');
  assert.deepEqual(lintPlan(plan), [
    'missing ## Plan basis',
    'missing ## Non-goals',
    'missing ## Context',
    'missing ## Final verification',
    'missing Walkthrough line',
    'Task 1: no Plan-task trailer',
    'Task 1 Step 1: no Run line',
    'placeholder: Step 2: TODO'
  ]);
});

test('lintPlan reports a plan with no tasks', () => {
  assert.ok(lintPlan('## Goal\n').includes('no tasks'));
});

test('countDriftReports counts each drifted task once', () => {
  assert.equal(countDriftReports('PLAN DRIFT: Task 2 region moved\nPLAN DRIFT: Task 2 again\nPLAN DRIFT: Task 3'), 2);
  assert.equal(countDriftReports(''), 0);
});

test('the results state the false-alarm rate over control branches and gate C2 on it', () => {
  const records = [
    record({ id: 'review-a-seeded-low', kind: 'review', variant: 'seeded', model: SWEEP_MODELS.opus, effort: 'low', defectsFound: 1 }),
    record({ id: 'review-a-control-low', kind: 'review', variant: 'control', model: SWEEP_MODELS.opus, effort: 'low', falseAlarms: 2 }),
    record({ id: 'review-a-control-medium', kind: 'review', variant: 'control', model: SWEEP_MODELS.opus, effort: 'medium', falseAlarms: 0 }),
    record({ id: 'review-b-control-medium', kind: 'review', variant: 'control', model: SWEEP_MODELS.opus, effort: 'medium', falseAlarms: null })
  ];
  const text = resultsMarkdown(META, records);
  assert.match(text, /\| review-a-seeded-low \| claude-opus-5-5 \| low \| 1 \| - \| 1000 \| 60s \| \$0\.500 \|/);
  assert.match(text, /Reviewer false-alarm rate: 1\/2 control branches \(50%\) drew at least one defect or hazard finding \(low 1\/1, medium 0\/1, high 0\/0\)\. Plan 5 \(C2\) is gated on this rate\./);
  assert.match(text, /Unmeasured: 1 control cells left no report\./);
});

test('the planning winner has the fewest rule breaches, then the fewest tokens, and settles Fable', () => {
  const records = [
    record({ id: 'plan-opus-high', kind: 'plan', model: SWEEP_MODELS.opus, effort: 'high', defectsFound: 1, tokens: 5000 }),
    record({ id: 'plan-fable-high', kind: 'plan', model: SWEEP_MODELS.fable, effort: 'high', defectsFound: 1, tokens: 7000 }),
    record({ id: 'plan-fable-xhigh', kind: 'plan', model: SWEEP_MODELS.fable, effort: 'xhigh', defectsFound: 0, tokens: 9000 })
  ];
  assert.match(resultsMarkdown(META, records),
    /Winning plan cell: plan-fable-xhigh \(0 rule breaches, 9000 tokens\)\. Fable 5\.1 beats Opus 5\.5 at high at xhigh\./);
});

test('a Fable cell that only ties Opus does not beat it', () => {
  const records = [
    record({ id: 'plan-opus-high', kind: 'plan', model: SWEEP_MODELS.opus, effort: 'high', defectsFound: 0, tokens: 5000 }),
    record({ id: 'plan-fable-high', kind: 'plan', model: SWEEP_MODELS.fable, effort: 'high', defectsFound: 0, tokens: 7000 })
  ];
  assert.match(resultsMarkdown(META, records),
    /Winning plan cell: plan-opus-high \(0 rule breaches, 5000 tokens\)\. Fable 5\.1 beats Opus 5\.5 at high at no effort\./);
});

test('a plan cell that wrote no plan never wins or beats Opus', () => {
  const records = [
    record({ id: 'plan-opus-high', kind: 'plan', model: SWEEP_MODELS.opus, effort: 'high', defectsFound: 2, tokens: 5000 }),
    record({ id: 'plan-fable-high', kind: 'plan', model: SWEEP_MODELS.fable, effort: 'high', defectsFound: null, tokens: 100, detail: 'no plan file' })
  ];
  assert.match(resultsMarkdown(META, records),
    /Winning plan cell: plan-opus-high \(2 rule breaches, 5000 tokens\)\. Fable 5\.1 beats Opus 5\.5 at high at no effort\./);
});

test('the whole-flow line carries drift, review defects, cost and time', () => {
  const records = [record({ id: 'flow-c7', kind: 'flow', model: SWEEP_MODELS.sonnet, effort: 'high', defectsFound: 0, detail: '4/4 tasks landed, 0 drift reports, review verdict CLEAN' })];
  assert.match(resultsMarkdown(META, records),
    /Whole flow \(C7\) on claude-sonnet-5 at high: 4\/4 tasks landed, 0 drift reports, review verdict CLEAN; 0 review defects, \$0\.500, 60s\./);
});
