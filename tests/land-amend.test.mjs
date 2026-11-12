import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { SCRIPT, compactCheckout, compactTask, PASS_REPORT } from './land-task-fixture.mjs';
import { compactPlanFixture } from './harness.mjs';

function land(root, planPath) {
  return run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });
}

test('an unclaimed missed path joins Files and the task lands with an AMEND line', async () => {
  const { root, planPath } = await compactCheckout();
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(landed.stdout, /^AMEND Task 1 src\/extra\.js$/m);
  assert.match(await fs.readFile(planPath, 'utf8'), /Files: `src\/app\.js`, `src\/extra\.js`/);
  assert.match(git(root, 'show', '--name-only', '--format=', 'HEAD'), /src\/extra\.js/);
});

test('a protected out-of-scope path warns outside Files as not committed, lands and edits no plan', async () => {
  const { root, planPath } = await compactCheckout();
  const before = await fs.readFile(planPath, 'utf8');
  await fs.mkdir(path.join(root, 'hooks'));
  await fs.writeFile(path.join(root, 'hooks/guard.mjs'), 'export {};\n');
  const refused = await land(root, planPath);
  assert.equal(refused.code, 0, refused.stderr);
  assert.match(refused.stdout, /^\[WARN\] .*outside Files: .*`hooks\/guard\.mjs`/m);
  assert.match(refused.stdout, /not committed: `hooks\/guard\.mjs`; add it to Files or give it its own task/);
  assert.equal(await fs.readFile(planPath, 'utf8'), before);
});

test('a missed path with a failing Proof is refused and edits no plan', async () => {
  const { root, planPath } = await compactCheckout();
  const before = await fs.readFile(planPath, 'utf8');
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() { return "no"; }\n');
  const refused = await land(root, planPath);
  assert.equal(refused.code, 1);
  assert.equal(await fs.readFile(planPath, 'utf8'), before);
});

test('a missed path that another open task claims warns outside Files, lands and edits no plan', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' }),
    compactTask({ number: 2, title: 'feat(app): extra', files: ['src/claimed.js'], proof: 'node tests/greet.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  const before = await fs.readFile(planPath, 'utf8');
  await fs.writeFile(path.join(root, 'src/claimed.js'), 'export const claimed = 1;\n');
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const refused = await land(root, planPath);
  assert.equal(refused.code, 0, refused.stderr);
  assert.match(refused.stdout, /^\[WARN\] .*outside Files: .*`src\/extra\.js`/m);
  assert.match(refused.stdout, /^\[WARN\] Task 1 left `src\/claimed\.js` for open Task 2$/m);
  assert.equal(await fs.readFile(planPath, 'utf8'), before);
});

test('an unknown task number with a missed path ends on the usage refusal', async () => {
  const { root, planPath } = await compactCheckout();
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const refused = await run(SCRIPT, ['--plan', planPath, '--task', '9', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /no Task 9 in the plan/);
  assert.doesNotMatch(refused.stderr, /TypeError/);
});

test('an amending land with an untracked plan widens the plan and lands', async () => {
  const { root, planPath } = await compactCheckout();
  git(root, 'rm', '--cached', '-q', 'docs/plans/compact.md');
  git(root, 'commit', '-q', '-m', 'untrack plan');
  await fs.appendFile(path.join(root, '.git/info/exclude'), 'docs/plans/\n');
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(await fs.readFile(planPath, 'utf8'), /Files: `src\/app\.js`, `src\/extra\.js`/);
});

test('an amending land commits no plan whose file has a hand edit', async () => {
  const { root, planPath } = await compactCheckout();
  await fs.appendFile(planPath, '\nhand note\n');
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.doesNotMatch(git(root, 'log', '--format=%s'), /widen Files/);
  assert.match(await fs.readFile(planPath, 'utf8'), /Files: `src\/app\.js`, `src\/extra\.js`/);
});
