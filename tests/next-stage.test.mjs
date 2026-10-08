// next-stage.mjs prints the next-stage question as one lettered question, A the
// recommended option (for spec: build fresh, or adjust while the brief lists an
// open point), with no model line; with `--fresh` it prints the lines
// the user types after the fresh-chat route, reading a plan's `Design:` tasks
// and `## Visual direction` to pick the model switch.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { freshReport, nextStageReport, openPoints } from '../skills/route-skills/scripts/next-stage.mjs';
import { compactPlanFixture, compactTask, fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';
import { assertQuestionShape } from './question-shape.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));

// The model of the kind `lib/model-kinds.json` gives the build stage.
function buildStageModel() {
  const { kinds, stages } = readKindTable();
  return kinds[stages.build.kind].model;
}

test('spec with no open point recommends building fresh: build fresh A, adjust the brief B', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.equal(report, [
    '**Is the brief ready to build?**',
    `The brief is written at \`${planPath}\` with no open point.`,
    '',
    '- **(A) Build fresh**: start a clean chat and build it there.',
    '- **(B) Adjust the brief**: change it before anything is built.',
    '',
    'Recommended: (A), because the brief settles every point and a clean chat builds it on a small context, while (B) reopens a settled brief.'
  ].join('\n') + '\n');
  assertQuestionShape(report);
  assert.equal(freshReport({ after: 'spec', artifact: planPath }), [
    `Type \`/clear\`, then \`/exo:build ${planPath}\`.`,
    `Before you type them, switch to a lighter model with \`/model ${buildStageModel()}\`.`
  ].join('\n') + '\n');
});

test('spec with an entry under ## Open points recommends adjusting the brief first', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] }).replace('## Visual direction', '## Open points\n\n- Assumed: the greeting stays English only.\n- Should a blank name fall back to "friend"?\n\n## Visual direction');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.ok(report.includes(`The brief is written at \`${planPath}\` with 2 open points under \`## Open points\`.`));
  assert.match(report, /\n- \*\*\(A\) Adjust the brief\*\*: .*\n- \*\*\(B\) Build fresh\*\*: .*\n\n/);
  assert.ok(report.endsWith('Recommended: (A), because the open points get settled before anything is built, while (B) builds on them unconfirmed.\n'));
  assertQuestionShape(report);
});

test('an empty ## Open points section counts as no open point', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] }).replace('## Visual direction', '## Open points\n\nNone.\n\n## Visual direction');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  assert.deepEqual(openPoints(planPath), []);
  assert.ok(nextStageReport({ after: 'spec', artifact: planPath }).includes('- **(A) Build fresh**'));
});

test('an issue artifact reads its open points from the scratch copy spec writes', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] }).replace('## Visual direction', '## Open points\n\n1. Should a blank name fall back to "friend"?\n\n## Visual direction');
  const root = await gitRepository({ '.exo/specs/42.md': plan });
  const result = await run(SCRIPT, ['--after', 'spec', '--artifact', '#42'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes('- **(A) Adjust the brief**'));
  const missing = await run(SCRIPT, ['--after', 'spec', '--artifact', '#43'], { cwd: root });
  assert.equal(missing.code, 0, missing.stderr);
  assert.ok(missing.stdout.includes('- **(A) Build fresh**'));
});

test('the fresh-chat route switches model when every Design: task holds a frozen direction', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  assert.ok(freshReport({ after: 'spec', artifact: planPath }).includes(`\`/model ${buildStageModel()}\``));
});

test('the fresh-chat route keeps the session model when a Design: task is still pending', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  assert.equal(freshReport({ after: 'spec', artifact: planPath }), `Type \`/clear\`, then \`/exo:build ${planPath}\`.\n`);
});

test('find-cause asks build or stop with no fresh-chat route, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'find-cause', artifact: 'none' });
  assert.match(report, /\n- \*\*\(A\) Build\*\*: build the fix now in this chat\.\n- \*\*\(B\) Stop\*\*/);
  assert.ok(report.includes('\nRecommended: (A), because '));
  assert.ok(!report.includes('Without an answer'));
  assertQuestionShape(report);
  assert.throws(() => freshReport({ after: 'find-cause', artifact: 'none' }), /no fresh-chat route/);
  assert.throws(() => nextStageReport({ after: 'ship', artifact: 'none' }), /no next stage known/);
});

test('CLI fails with a usage error when --after is missing', async () => {
  const result = await run(SCRIPT, ['--artifact', 'none']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--after/);
});

test('CLI prints the fresh-chat lines with --fresh', async () => {
  const root = await gitRepository({ 'docs/plans/fixture.md': planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] }) });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const result = await run(SCRIPT, ['--after', 'spec', '--artifact', planPath, '--fresh']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, freshReport({ after: 'spec', artifact: planPath }));
});

test('after spec both reports name the runner command only when plan-check --loop passes', async () => {
  const tasks = [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })];
  const loopPlan = compactPlanFixture({ tasks }).replace('Branch: feat/fixture', 'Branch: feat/fixture\nAllow: none');
  const root = await gitRepository({ 'docs/plans/loop.md': loopPlan, 'docs/plans/plain.md': compactPlanFixture({ tasks }) });
  const loopPath = path.join(root, 'docs/plans/loop.md');
  const plainPath = path.join(root, 'docs/plans/plain.md');
  const runner = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
  const line = `Unattended, with Claude Code: node "${runner}" ${loopPath}`;
  assert.ok(nextStageReport({ after: 'spec', artifact: loopPath }).endsWith(`\n\n${line}\n`));
  assert.ok(freshReport({ after: 'spec', artifact: loopPath }).endsWith(`\n${line}\n`));
  assert.ok(!nextStageReport({ after: 'spec', artifact: plainPath }).includes('Unattended'));
  assert.ok(!freshReport({ after: 'spec', artifact: plainPath }).includes('Unattended'));
  assert.ok(!nextStageReport({ after: 'find-cause', artifact: loopPath }).includes('Unattended'));
});
