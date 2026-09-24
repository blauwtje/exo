// next-stage.mjs prints the next-stage question's fixed-order options and,
// for the stages `references/next-stage.md`'s table names, the one model
// line under them, reading a plan's `Design:` tasks and `## Visual
// direction` to pick the implementing row.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextStageReport } from '../skills/using-exo/scripts/next-stage.mjs';
import { gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/using-exo/scripts/next-stage.mjs', import.meta.url));

test('shaping opens planning, recommends stop with the plan command', () => {
  const report = nextStageReport({ after: 'shaping', artifact: 'docs/specs/topic.md' });
  assert.equal(report, [
    '1. **Stop (Recommended)**: run `/exo:planning docs/specs/topic.md` after a context clear.',
    '2. **Planning**: orders the brief into a plan.',
    "Next stage runs on `opus` at `high`, because a plan's code is pasted as written, so a slip repeats in every task."
  ].join('\n') + '\n');
});

test('planning opens implementing on sonnet when every Design: task holds a frozen direction', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'planning', artifact: planPath });
  assert.match(report, /2\. \*\*Implementing\*\*: runs the plan\.\n/);
  assert.match(report, /Next stage runs on `sonnet` at `medium`/);
});

test('planning opens implementing on opus when a Design: task is still pending', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'planning', artifact: planPath });
  assert.match(report, /Next stage runs on `opus` at `medium`/);
});

test('debug opens implementing-batch, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'debug', artifact: 'none' });
  assert.match(report, /2\. \*\*Implementing-batch\*\*: builds the edits the proof left\.\n/);
  assert.match(report, /Next stage runs on `opus` at `high`, because it decides the change while building it\./);
  assert.throws(() => nextStageReport({ after: 'shipping', artifact: 'none' }), /no next stage known/);
});

test('CLI prints the report for the flags given', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const result = await run(SCRIPT, ['--after', 'planning', '--artifact', planPath]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /1\. \*\*Stop \(Recommended\)\*\*: run `\/exo:implementing/);
});

test('CLI fails with a usage error when --after is missing', async () => {
  const result = await run(SCRIPT, ['--artifact', 'none']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--after/);
});
