// next-stage.mjs prints the next-stage question as one lettered question, A the
// recommended option (find-cause only; spec asks nothing); with `--fresh` it prints the lines
// the user types after the fresh-chat route, reading a plan's `Design:` tasks
// and `## Visual direction` to pick the model switch.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { freshReport, nextStageReport } from '../skills/route-skills/scripts/next-stage.mjs';
import { compactPlanFixture, compactTask, fixture, gitRepository, planFixture, run, taskSection } from './harness.mjs';
import { assertQuestionShape } from './question-shape.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/route-skills/scripts/next-stage.mjs', import.meta.url));

const { kinds: KINDS, stages: STAGES } = readKindTable();
const BUILD_EFFORT = KINDS[STAGES.build.kind].effort;
const EFFORT_LINE = `Build runs best at \`${BUILD_EFFORT}\` effort: type \`/effort ${BUILD_EFFORT}\` first; \`/effort auto\` returns the session to normal effort.`;

// The model of the kind `lib/model-kinds.json` gives the build stage.
function buildStageModel() {
  const { kinds, stages } = readKindTable();
  return kinds[stages.build.kind].model;
}

test('spec asks nothing: the question route fails, the fresh-chat route prints the build lines, model switch and effort way back', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
  ] });
  const root = await gitRepository({ 'docs/plans/fixture.md': plan });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  assert.throws(() => nextStageReport({ after: 'spec', artifact: planPath }), /asks no question/);
  assert.equal(freshReport({ after: 'spec', artifact: planPath }), [
    `Type \`/clear\`, then \`/exo:build ${planPath}\`.`,
    `Before you type them, switch to a lighter model with \`/model ${buildStageModel()}\`.`,
    EFFORT_LINE
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
  assert.equal(freshReport({ after: 'spec', artifact: planPath }), `Type \`/clear\`, then \`/exo:build ${planPath}\`.\n${EFFORT_LINE}\n`);
});

test('find-cause asks build or stop with no fresh-chat route, unknown stage fails', async () => {
  const report = nextStageReport({ after: 'find-cause', artifact: 'none' });
  assert.match(report, /\n- \*\*\(A\) Build\*\*: build the fix now\n- \*\*\(B\) Stop\*\*/);
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

test('CLI hands off an issue brief #<n> from its scratch copy, reading its Design: tasks', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Style', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }).replace('Quiet record.', 'Direction: pending at rung 2');
  const root = await gitRepository({ '.exo/specs/42.md': plan });
  const result = await run(SCRIPT, ['--after', 'spec', '--artifact', '#42', '--fresh'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `Type \`/clear\`, then \`/exo:build #42\`.\n${EFFORT_LINE}\n`);
});

test('after spec the fresh-chat lines name the runner command only when plan-check --loop passes', async () => {
  const tasks = [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })];
  const redirecting = [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs > out.log' })];
  // The harness fixture predates the required Land: line; add it after Branch:.
  const withLand = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nCommit: feat(fixture): add the fixture');
  const root = await gitRepository({ 'docs/plans/loop.md': withLand(compactPlanFixture({ tasks })), 'docs/plans/plain.md': withLand(compactPlanFixture({ tasks: redirecting })), 'src/app.js': '' });
  const loopPath = path.join(root, 'docs/plans/loop.md');
  const plainPath = path.join(root, 'docs/plans/plain.md');
  const runner = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
  const line = `Unattended, with Claude Code: node "${runner}" ${loopPath}`;
  assert.ok(freshReport({ after: 'spec', artifact: loopPath }).endsWith(`\n${line}\n`));
  assert.ok(!freshReport({ after: 'spec', artifact: plainPath }).includes('Unattended'));
  assert.ok(!nextStageReport({ after: 'find-cause', artifact: loopPath }).includes('Unattended'));
});

test('after spec the runner line is withheld when the checkout holds a proof test the brief does not list', async () => {
  const tasks = [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })];
  const withLand = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nCommit: feat(fixture): add the fixture');
  const root = await gitRepository({ 'docs/plans/gap.md': withLand(compactPlanFixture({ tasks })), 'src/app.js': '', 'tests/app.test.mjs': '' });
  const gapPath = path.join(root, 'docs/plans/gap.md');
  assert.ok(!freshReport({ after: 'spec', artifact: gapPath }).includes('Unattended'));
});

test('after spec a brief with open points gets no build route, only each entry to answer first', async () => {
  const tasks = [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })];
  const open = compactPlanFixture({ tasks }).replace('## Tasks', '## Open points\n\n- Which tone?\n- Which owner?\n\n## Tasks');
  const root = await gitRepository({ 'docs/plans/open.md': open });
  const openPath = path.join(root, 'docs/plans/open.md');
  const report = freshReport({ after: 'spec', artifact: openPath });
  assert.ok(report.startsWith(`The brief at \`${openPath}\` has 2 open points, which build refuses.`));
  assert.ok(report.endsWith('\n- Which tone?\n- Which owner?\n'));
  assert.ok(!report.includes('/exo:build'));
  assert.ok(!report.includes('Unattended'));
});
