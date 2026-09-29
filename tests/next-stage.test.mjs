// next-stage.mjs prints the next-stage question's options, continuing first
// even in a session context-watch.mjs marked warned, and, for the stages
// `references/next-stage.md`'s table names, the one model line under them, reading a plan's `Design:` tasks and `## Visual
// direction` to pick the build row.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { hotFile } from '../skills/show-savings/scripts/record.mjs';
import { fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));
const RUN_PLAN_SONNET_LINE = "Next stage runs on `sonnet` at `medium`, because the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps `high`.";

// The model and effort of the kind `lib/model-kinds.json` gives the stage
// that opens build with no spec.
function noSpecStageKind() {
  const { kinds, stages } = readKindTable();
  return kinds[stages['build-no-spec'].kind];
}

// A savings directory holding the hot record of a session context-watch.mjs
// already warned, at the path record.mjs keeps it.
async function warnedSavingsDirectory(sessionId) {
  const directory = await fixture();
  const previous = process.env.EXO_SAVINGS_DIR;
  process.env.EXO_SAVINGS_DIR = directory;
  const file = hotFile(sessionId);
  if (previous === undefined) delete process.env.EXO_SAVINGS_DIR;
  else process.env.EXO_SAVINGS_DIR = previous;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ contextWatch: { notifiedStep: 100, warned: true } })}\n`);
  return directory;
}

test('spec recommends continuing into build, Stop second', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.equal(report, [
    '1. **Build (Recommended)**: runs the plan.',
    `2. **Stop**: run \`/exo:build ${planPath}\` after a context clear.`,
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
  assert.match(report, /^1\. \*\*Build \(Recommended\)\*\*: runs the plan\.\n/);
  assert.match(report, /Next stage runs on `sonnet` at `medium`/);
});

test('spec opens build on opus when a Design: task is still pending', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextStageReport({ after: 'spec', artifact: planPath });
  assert.match(report, /Next stage runs on `opus` at `medium`/);
});

test('find-cause opens build with no spec, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'find-cause', artifact: 'none' });
  assert.match(report, /^1\. \*\*Build \(Recommended\)\*\*: builds the edits the proof left\.\n/);
  const { model, effort } = noSpecStageKind();
  assert.ok(report.includes(`Next stage runs on \`${model}\` at \`${effort}\`, because it decides the change while building it.`));
  assert.throws(() => nextStageReport({ after: 'ship', artifact: 'none' }), /no next stage known/);
});

test('CLI keeps Build first in a session the context watch has warned', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const directory = await warnedSavingsDirectory('warned-session');
  const env = { EXO_SAVINGS_DIR: directory, CLAUDE_CODE_SESSION_ID: 'warned-session' };
  const result = await run(SCRIPT, ['--after', 'spec', '--artifact', planPath], { env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, [
    '1. **Build (Recommended)**: runs the plan.',
    `2. **Stop**: run \`/exo:build ${planPath}\` after a context clear.`,
    RUN_PLAN_SONNET_LINE
  ].join('\n') + '\n');
});

test('CLI fails with a usage error when --after is missing', async () => {
  const result = await run(SCRIPT, ['--artifact', 'none']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--after/);
});

test('the no-plan model line takes its model and effort from the kind of the build-no-spec stage', () => {
  const { model, effort } = noSpecStageKind();
  const modelLine = nextStageReport({ after: 'find-cause', artifact: 'none' }).split('\n')[2];
  assert.ok(modelLine.startsWith(`Next stage runs on \`${model}\` at \`${effort}\`, because `));
});
