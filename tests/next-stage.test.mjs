// next-stage.mjs prints the next-stage question as one lettered question, A the
// recommended option, with no model line; with `--fresh` it prints the lines
// the user types after the fresh-chat route, reading a plan's `Design:` tasks
// and `## Visual direction` to pick the model switch.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { freshReport, nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';
import { assertQuestionShape } from './question-shape.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));

// The model of the kind `lib/model-kinds.json` gives the build stage.
function buildStageModel() {
  const { kinds, stages } = readKindTable();
  return kinds[stages.build.kind].model;
}

test('spec ends on one question: adjust the brief A, build here B, build fresh C', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.equal(report, [
    '**Is the brief ready to build?**',
    `The brief is written at \`${planPath}\`.`,
    '',
    '- **(A) Adjust the brief**: change it before anything is built.',
    '- **(B) Build here**: build it now in this chat.',
    '- **(C) Build fresh**: start a clean chat and build it there.',
    '',
    'Recommended: (A), because nothing gets built before the brief reads right, while (B) and (C) build it as written.'
  ].join('\n') + '\n');
  assertQuestionShape(report);
  assert.equal(freshReport({ after: 'spec', artifact: planPath }), [
    `Type \`/clear\`, then \`/exo:build ${planPath}\`.`,
    `Before you type them, switch to a lighter model with \`/model ${buildStageModel()}\`.`
  ].join('\n') + '\n');
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
