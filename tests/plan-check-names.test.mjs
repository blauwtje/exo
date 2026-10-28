import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture, compactTask, gitRepository, run } from './harness.mjs';

const PLAN_CHECK = new URL('../skills/spec/scripts/plan-check.mjs', import.meta.url).pathname;

async function existingTestProblems(testFiles) {
  const root = await gitRepository({ 'benchmarks/run.mjs': 'export {};\n', ...testFiles });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Change the runner', files: ['benchmarks/run.mjs'] })] });
  return planCheckReport(plan, { root }).lines.filter((line) => line.includes('has existing tests'));
}

test('a test named for a source but importing another file of that stem is not its test', async () => {
  const problems = await existingTestProblems({
    'tests/run-session-sandbox.test.mjs': "import '../skills/build/scripts/run-session.mjs';\n"
  });
  assert.deepEqual(problems, []);
});

test('a name-matched test that imports the source is still flagged', async () => {
  const problems = await existingTestProblems({
    'tests/run-dry.test.mjs': "import '../benchmarks/run.mjs';\n"
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /tests\/run-dry\.test\.mjs/);
});

test('a name-matched test reaching the source through a relative helper is still flagged', async () => {
  const problems = await existingTestProblems({
    'tests/run-helper.mjs': "export const target = 'benchmarks/run.mjs';\n",
    'tests/run-dry.test.mjs': "import { target } from './run-helper.mjs';\n"
  });
  assert.equal(problems.length, 1);
});

test('--help prints the usage and exits 0', async () => {
  const help = await run(PLAN_CHECK, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^usage: plan-check\.mjs --plan <plan>/);
  assert.match(help.stdout, /--loop/);
  assert.match(help.stdout, /--run/);
});
