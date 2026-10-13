// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkTask, landTask } from '../skills/build/scripts/land-task.mjs';
import { proofRecordPath } from '#plan-tasks';
import { compactPlanFixture, git, gitRepository, planFixture, run } from './harness.mjs';
import {
  compactTask, taskSection, SCRIPT, PLAN, landingCheckout, editApp, PASS_REPORT, compactCheckout, writeReport,
  MCP_PLAN
} from './land-task-fixture.mjs';

// A block's builders share one checkout: task 2's files sit uncommitted while
// task 1 checks and lands.
const SIBLING_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' }),
  compactTask({ number: 2, title: 'feat(app): left', files: ['src/left.js', 'tests/left.test.mjs'], proof: 'node tests/left.test.mjs' })
] });

async function siblingCheckout() {
  const { root, planPath } = await compactCheckout(SIBLING_PLAN);
  await fs.writeFile(path.join(root, 'src/left.js'), 'export const left = 1;\n');
  await fs.writeFile(path.join(root, 'tests/left.test.mjs'), "console.log('# pass 1');\n");
  await writeReport(root, PASS_REPORT);
  return { root, planPath };
}

test('--check passes beside an unlanded sibling task\'s files and still refuses a path no task names', async () => {
  const { root, planPath } = await siblingCheckout();
  const check = () => run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--check'], { cwd: root });
  const ok = await check();
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.stdout, 'Report OK: Task 1\n');
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const stray = await check();
  assert.equal(stray.code, 1);
  assert.match(stray.stderr, /outside Files: `src\/extra\.js`$/m);
});

test('a landing beside a sibling task\'s files commits only its own Files:, and a landed task\'s path is a stray again', async () => {
  const { root, planPath } = await siblingCheckout();
  const output = landTask({ planPath, planText: SIBLING_PLAN, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n'), ['src/app.js']);
  assert.match(git(root, 'status', '--porcelain'), /src\/left\.js/);
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello!";\n}\n');
  assert.throws(() => checkTask({ planPath, planText: SIBLING_PLAN, number: 2, root, reportText: 'Proof:\n- `node tests/left.test.mjs`: pass\n' }), /Task 2 changed a path outside Files: `src\/app\.js`/);
});

test('a landing refuses a staged sibling path, which its commit would take', async () => {
  const { root, planPath } = await siblingCheckout();
  git(root, 'add', 'src/left.js');
  assert.throws(() => landTask({ planPath, planText: SIBLING_PLAN, number: 1, root, reportText: PASS_REPORT }), /outside Files: `src\/left\.js`/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('a plan-written Commit: block lands beside no path no task names', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(path.join(root, 'src/note.md'), '# note\n');
  assert.throws(() => landTask({ planPath, planText: PLAN, number: 1, root }), /Task 1 changed a path outside Files: `src\/note\.md`/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('--check on an mcp: Proof task reads the deferred line', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  await writeReport(root, 'Proof:\nmcp:run_playtest mode=play: deferred\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--check'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'Report OK: Task 1\n');
});

test('a Files: entry ending in / covers every changed path under that folder', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Snapshots', files: ['- Create: `src/snaps/`'], subject: 'test(app): snapshots' })
  ] });
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/fixture.md': plan });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.mkdir(path.join(root, 'src/snaps/deep'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/snaps/a.png'), 'a');
  await fs.writeFile(path.join(root, 'src/snaps/deep/b.png'), 'b');
  const output = landTask({ planPath: path.join(root, 'docs/plans/fixture.md'), planText: plan, number: 1, root });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('on the inline route a landing names the next task, never a wave, though the plan allows one', async () => {
  const plan = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], code: 'export function greet() {}', subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Left', files: ['- Create: `src/left.js`'], code: 'export const left = 1;', subject: 'feat(app): left' }),
    taskSection({ number: 3, title: 'Right', files: ['- Create: `src/right.js`'], code: 'export const right = 1;', subject: 'feat(app): right' })
  ] });
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  assert.match(landTask({ planPath, planText: plan, number: 1, root }), /\nLanded: 1\nRoute: inline \(3 tasks, code pasted, files disjoint\)\nNext: Task 2\n$/);
  await fs.access(proofRecordPath(root, 'fixture', 1));
});

// The inline route's lead tends to write every task's files before landing the
// first; each task's Commit: block adds only its own Files:.
function inlineTask(number, file, code, add = file) {
  const section = taskSection({ number, title: `Part ${number}`, files: [`- ${number === 1 ? 'Modify' : 'Create'}: \`${file}\``], code, subject: `feat(app): part ${number}`, commit: false });
  return `${section}Commit:\n\`\`\`bash\ngit add ${add}\ngit commit -m "feat(app): part ${number}" -m "Plan-task: ${number}"\n\`\`\`\n`;
}

const INLINE_FILES = ['src/app.js', 'src/left.js', 'src/right.js', 'src/up.js'];

async function inlineCheckoutAllWritten(adds = INLINE_FILES) {
  const plan = planFixture({ tasks: INLINE_FILES.map((file, index) => inlineTask(index + 1, file, `export const part${index + 1} = 1;`, adds[index])) });
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  for (const file of INLINE_FILES.slice(1)) await fs.writeFile(path.join(root, file), 'export const part = 1;\n');
  return { plan, root, planPath };
}

test('on the inline route each task lands beside every later task\'s written files and commits only its own', async () => {
  const { plan, root, planPath } = await inlineCheckoutAllWritten();
  assert.match(landTask({ planPath, planText: plan, number: 1, root }), /Route: inline \(4 tasks, code pasted, files disjoint\)\nNext: Task 2\n$/);
  for (const [index, file] of INLINE_FILES.entries()) {
    if (index > 0) assert.match(landTask({ planPath, planText: plan, number: index + 1, root }), /^Committed: [0-9a-f]+ Task \d$/m);
    assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n'), [file]);
  }
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), '');
});

test('on the inline route a Commit: block whose git add covers a later task\'s file refuses it', async () => {
  const { plan, root, planPath } = await inlineCheckoutAllWritten(['src/app.js src/', ...INLINE_FILES.slice(1)]);
  assert.throws(() => landTask({ planPath, planText: plan, number: 1, root }), /Task 1 changed a path outside Files: `src\/left\.js`, `src\/right\.js`, `src\/up\.js`/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});
