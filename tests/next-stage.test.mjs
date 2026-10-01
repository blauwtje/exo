// next-stage.mjs prints the next-stage question as a lettered pick, A the
// recommended option, and, for the stages
// `references/next-stage.md`'s table names, the one model line under them, reading a plan's `Design:` tasks and `## Visual
// direction` to pick the build row.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));
const RUN_PLAN_SONNET_LINE = "Next stage runs on `sonnet` at `medium`, because the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps `high`.";

// The model and effort of the kind `lib/model-kinds.json` gives the stage
// that opens build with no spec.
function noSpecStageKind() {
  const { kinds, stages } = readKindTable();
  return kinds[stages['build-no-spec'].kind];
}

test('spec ends on a lettered pick, adjust the brief A and build here B', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.equal(report, [
    '**1 · Next step**',
    `The brief is written at \`${planPath}\`.`,
    '',
    '- **A · Adjust the brief**: change it before anything is built.',
    '- **B · Build here**: runs the brief in this session.',
    '',
    '→ A. nothing is built before the brief reads right.',
    `Without an answer, nothing starts; type \`/clear\` and then \`/exo:build ${planPath}\` to build in a fresh session.`,
    RUN_PLAN_SONNET_LINE
  ].join('\n') + '\n');
});

test('spec opens build on sonnet when every Design: task holds a frozen direction', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.match(report, /\n- \*\*A · Adjust the brief\*\*/);
  assert.match(report, /\n- \*\*B · Build here\*\*/);
  assert.match(report, /Next stage runs on `sonnet` at `medium`/);
});

test('spec opens build on the session model when a Design: task is still pending', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  const { kinds, skills } = readKindTable();
  const { effort } = kinds[skills['skills/build/SKILL.md'].kind];
  assert.ok(report.includes(`Next stage runs on the session's model at \`${effort}\`, because that task builds in the session, and the skill pins \`${effort}\`.`));
});

test('find-cause opens build with no spec, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'find-cause', artifact: 'none' });
  assert.match(report, /\n- \*\*A · Build\*\*: builds the edits the proof left\.\n- \*\*B · Stop\*\*/);
  assert.ok(report.includes('\n→ A. '));
  const { model, effort } = noSpecStageKind();
  assert.ok(report.includes(`Next stage runs on \`${model}\` at \`${effort}\`, because it decides the change while building it.`));
  assert.throws(() => nextStageReport({ after: 'ship', artifact: 'none' }), /no next stage known/);
});

test('CLI fails with a usage error when --after is missing', async () => {
  const result = await run(SCRIPT, ['--artifact', 'none']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--after/);
});

test('the no-plan model line takes its model and effort from the kind of the build-no-spec stage', () => {
  const { model, effort } = noSpecStageKind();
  const modelLine = nextStageReport({ after: 'find-cause', artifact: 'none' }).split('\n').at(-2);
  assert.ok(modelLine.startsWith(`Next stage runs on \`${model}\` at \`${effort}\`, because `));
});
