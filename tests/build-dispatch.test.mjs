import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { landingCheckout, reportFile } from './land-task-fixture.mjs';

const BUILD_DISPATCH = new URL('../skills/build/scripts/build-dispatch.mjs', import.meta.url).pathname;
const PLAN = 'docs/plans/fixture.md';

async function dispatch(extra = []) {
  const { root } = await landingCheckout();
  git(root, 'checkout', '-q', '-b', 'topic');
  const result = await run(BUILD_DISPATCH, ['--plan', PLAN, '--root', root, ...extra], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  return { out: result.stdout, root };
}

test('attempt 1 names the builder, no model override and the Dispatch lines in a Prompt block', async () => {
  const { out, root } = await dispatch();
  assert.match(out, /^Agent: exo:builder$/m);
  assert.match(out, /^Model: none$/m);
  assert.match(out, /^Prompt:\n {2}Plan: .*fixture\.md\n {2}Checkout: .*\n {2}Task: 1\n {2}Read first: .*brief\.md\n {2}Report path: .*\n {2}Prompt: .*run-task-prompt\.md\n {2}Land with: --plan .* --task 1 --root .*$/m);
  assert.ok(out.includes(`Checkout: ${fsSync.realpathSync(root)}`) || out.includes(`Checkout: ${root}`));
  assert.doesNotMatch(out, /^Dispatch:/m);
});

test('a later attempt prints the retry model and effort', async () => {
  const { out } = await dispatch(['--attempt', '2']);
  assert.match(out, /^Model: opus high$/m);
});

test('a missing input prints the builder frontmatter model and effort', async () => {
  const { out } = await dispatch(['--attempt', '2', '--missing-input']);
  assert.match(out, /^Model: sonnet medium$/m);
});

test('a failed report adds the Failed report path to the output', async () => {
  const { root } = await landingCheckout();
  git(root, 'checkout', '-q', '-b', 'topic');
  await run(BUILD_DISPATCH, ['--plan', PLAN, '--root', root], { cwd: root });
  fsSync.writeFileSync(reportFile(root, 'fixture', 1), 'Task 1: BLOCKED nope\n');
  const result = await run(BUILD_DISPATCH, ['--plan', PLAN, '--root', root, '--attempt', '2'], { cwd: root });
  assert.match(result.stdout, /^Failed report: .*failed-report\.md$/m);
});
