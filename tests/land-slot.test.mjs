
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { writeBuildProgress } from '../lib/build-progress.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { compactPlanFixture, git, run, tempDir } from './harness.mjs';
import { landingCheckout, compactCheckout, compactTask, editApp, PASS_REPORT } from './land-task-fixture.mjs';

const SCRIPT = new URL('../skills/build/scripts/land-slot.mjs', import.meta.url).pathname;

async function slotFixture() {
  const { root, planPath } = await landingCheckout();
  excludeScratch(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const slot = `${root}-task-1`;
  git(root, 'worktree', 'add', '--detach', slot, 'HEAD');
  await fs.mkdir(path.join(slot, '.exo'), { recursive: true });
  const baseline = path.join(root, '.exo', 'baseline.txt');
  await fs.mkdir(path.dirname(baseline), { recursive: true });
  await fs.writeFile(baseline, git(root, 'status', '--porcelain'));
  await fs.writeFile(path.join(slot, '.exo', 'implementer-1.md'), 'Landed: src/app.js\nUnresolved: none\n');
  const land = (inFlight = ['--in-flight', '3'], env = {}) => run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--slot', slot, '--base', base, '--baseline', baseline, ...inFlight], { cwd: root, env });
  return { root, slot, land, base };
}

const worktrees = (root) => git(root, 'worktree', 'list');

test('a green slot lands on the run branch and its worktree leaves', async () => {
  const { root, slot, land } = await slotFixture();
  await editApp(slot);
  const result = await land();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^LANDED 1\b/);
  assert.match(result.stdout, /^Start: (?:none|Task \d)/m);
  assert.doesNotMatch(result.stdout, /kept:/);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: fixture\/1$/m);
  assert.doesNotMatch(worktrees(root), new RegExp(slot));
  assert.match(await fs.readFile(path.join(root, 'src/app.js'), 'utf8'), /hello/);
});

test('a slot build whose return text comes on stdin and whose report file is missing lands', async () => {
  const { root, planPath } = await compactCheckout();
  git(root, 'checkout', '--', 'src/app.js');
  const base = git(root, 'rev-parse', 'HEAD');
  const slot = `${root}-task-1`;
  git(root, 'worktree', 'add', '--detach', slot, 'HEAD');
  const baseline = path.join(root, '.exo', 'baseline.txt');
  await fs.mkdir(path.dirname(baseline), { recursive: true });
  await fs.writeFile(baseline, git(root, 'status', '--porcelain'));
  await editApp(slot);
  const args = ['--plan', planPath, '--task', '1', '--root', root, '--slot', slot, '--base', base, '--baseline', baseline, '--in-flight', '3', '--report', '-'];
  const result = await run(SCRIPT, args, { cwd: root, input: PASS_REPORT });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^LANDED 1\b/);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
  assert.doesNotMatch(worktrees(root), new RegExp(slot));
});

test('a green slot prints the caller view and names the full text in a land-slot log', async () => {
  const { slot, land } = await slotFixture();
  await editApp(slot);
  const result = await land();
  const detail = result.stdout.match(/^Detail: (.+)$/m);
  assert.ok(detail, result.stdout);
  assert.match(detail[1], /land-slot-1\.log$/);
  const full = await fs.readFile(detail[1], 'utf8');
  assert.match(full, /^LANDED 1\b/);
  assert.ok(result.stdout.length < full.length + detail[1].length + 10);
});

test('a refused landing keeps the slot and puts nothing on the run branch', async () => {
  const { root, slot, land } = await slotFixture();
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await land();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^REFUSED 1: the Commit: block of Task 1 failed:/);
  assert.match(result.stdout, /^slot \S+ kept$/m);
  assert.match(result.stdout, /^Start: none$/m);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(worktrees(root), new RegExp(slot));
});

test('a refused landing prints Land: for the rebuild into the same slot and records a since from the refusal', async () => {
  const { root, slot, land, base } = await slotFixture();
  const other = `${root}-task-3`;
  const window = path.join(root, '.exo', 'window.json');
  await fs.writeFile(window, JSON.stringify({ 1: { slot, base, since: 1000000000 }, 3: { slot: other, base, since: 1000000003 } }));
  const before = Math.floor(Date.now() / 1000);
  const result = await land(undefined, { EXO_RUN_SESSION: '1' });
  assert.match(result.stdout, /^REFUSED 1: the Commit: block of Task 1 failed:/);
  assert.match(result.stdout, /^slot \S+ kept$/m);
  assert.doesNotMatch(result.stdout, /^Wait:/m);
  assert.match(result.stdout, new RegExp(`^Land 1: node ".+land-slot\\.mjs" .*--task 1 .*--slot "${slot}" --base ${base} .*--in-flight 3$`, 'm'));
  assert.match(result.stdout, new RegExp(`^Land 3: node ".+land-slot\\.mjs" .*--task 3 .*--slot "${other}" `, 'm'));
  assert.ok(JSON.parse(await fs.readFile(window, 'utf8'))[1].since >= before);
});

test('--only reaches the rebuild Land: lines of a refused landing and a landing with the block done starts nothing', async () => {
  const { root, slot, land, base } = await slotFixture();
  const other = `${root}-task-3`;
  await fs.writeFile(path.join(root, '.exo', 'window.json'), JSON.stringify({ 1: { slot, base, since: 1000000000 }, 3: { slot: other, base, since: 1000000003 } }));
  const refused = await land(['--in-flight', '3', '--only', '1,3']);
  assert.equal(refused.code, 0, refused.stderr);
  assert.match(refused.stdout, /^Land 1: .*--in-flight 3 --only 1,3$/m);
  assert.match(refused.stdout, /^Land 3: .* --only 1,3$/m);
  await editApp(slot);
  const landed = await land(['--in-flight', '3', '--only', '1,3']);
  assert.match(landed.stdout, /^LANDED 1\b/);
  assert.match(landed.stdout, /^Start: none$/m);
});

test('a non-numeric --only is a usage error', async () => {
  const { land } = await slotFixture();
  const result = await land(['--only', 'a,b']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--only/);
});

test('a new path in the run checkout lands nothing and keeps the slot', async () => {
  const { root, slot, land } = await slotFixture();
  const head = git(root, 'rev-parse', 'HEAD');
  await editApp(slot);
  await fs.writeFile(path.join(root, 'stray.txt'), 'x\n');
  const result = await land();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^NEWPATH 1\b.*stray\.txt/s);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(worktrees(root), new RegExp(slot));
  assert.match(git(slot, 'status', '--porcelain'), /src\/app\.js/);
});

test('a cherry-pick conflict aborts, keeps the slot and leaves the run branch clean', async () => {
  const { root, slot, land } = await slotFixture();
  await editApp(slot);
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "other";\n}\n');
  git(root, 'commit', '-q', '-am', 'chore: diverge');
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await land();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^CONFLICT 1\b/);
  assert.match(result.stdout, /^Start: none$/m);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.match(worktrees(root), new RegExp(slot));
});

test('a cherry-pick whose abort fails does not claim the run checkout is clean', async () => {
  const { root, slot, land } = await slotFixture();
  await editApp(slot);
  await fs.writeFile(path.join(root, '.git', 'index.lock'), '');
  const result = await land();
  await fs.rm(path.join(root, '.git', 'index.lock'));
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^CONFLICT 1\b/);
  assert.doesNotMatch(result.stdout, /was aborted/);
  assert.match(result.stdout, /abort failed/);
});

test('a landing with no other slot running ends with a Next: or Wave: refill line', async () => {
  const { slot, land } = await slotFixture();
  await editApp(slot);
  const result = await land([]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^LANDED 1\b/);
  assert.match(result.stdout, /^(Next|Wave): /m);
  assert.doesNotMatch(result.stdout, /^Start: /m);
});

test('a landed slot refreshes the session record', async () => {
  const { root, slot, land } = await slotFixture();
  const cache = tempDir('exo-progress-');
  const env = { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' };
  writeBuildProgress({ sessionId: 'sess-1', plan: path.join(root, 'docs/plans/fixture.md'), checkout: root, landed: 0, total: 4 }, { env, now: 1000 });
  await editApp(slot);
  const result = await land(['--in-flight', '3'], env);
  assert.equal(result.code, 0, result.stderr);
  const record = JSON.parse(await fs.readFile(path.join(cache, 'exo', 'build', 'sess-1.json'), 'utf8'));
  assert.equal(record.landed, 1);
  assert.equal(record.total, 4);
});

test('--help prints the usage and exits 0', async () => {
  const help = await run(SCRIPT, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^usage: land-slot\.mjs --plan <plan> --task <n>/);
  assert.match(help.stdout, /--in-flight/);
  assert.match(help.stdout, /--chained/);
});

test('a land that amends Files leaves no pending plan edit to refuse the next slot', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' }),
    compactTask({ number: 2, title: 'feat(two): two', files: ['src/two.js'], proof: 'node tests/greet.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  git(root, 'checkout', '--', 'src/app.js');
  const base = git(root, 'rev-parse', 'HEAD');
  const baseline = path.join(root, '.exo', 'baseline.txt');
  await fs.mkdir(path.dirname(baseline), { recursive: true });
  await fs.writeFile(baseline, git(root, 'status', '--porcelain'));
  const slots = [`${root}-task-1`, `${root}-task-2`];
  for (const slot of slots) git(root, 'worktree', 'add', '--detach', slot, 'HEAD');
  await editApp(slots[0]);
  await fs.writeFile(path.join(slots[0], 'src/extra.js'), 'export const extra = 1;\n');
  await fs.writeFile(path.join(slots[1], 'src/two.js'), 'export const two = 2;\n');
  const land = (number, slot, input) => run(SCRIPT, ['--plan', planPath, '--task', String(number), '--root', root, '--slot', slot, '--base', base, '--baseline', baseline, '--in-flight', '1,2', '--report', '-'], { cwd: root, input });
  const first = await land(1, slots[0], PASS_REPORT);
  assert.match(first.stdout, /^AMEND Task 1 src\/extra\.js$/m);
  const second = await land(2, slots[1], PASS_REPORT.replace('src/app.js', 'src/two.js').replace('tests/app.test.mjs', 'tests/greet.test.mjs'));
  assert.doesNotMatch(second.stdout, /NEWPATH/);
});

test('a tracked file an open sibling lists and this task modified is no sibling work', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' }),
    compactTask({ number: 2, title: 'feat(two): two', files: ['src/two.js'], proof: 'node tests/greet.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  git(root, 'checkout', '--', 'src/app.js');
  await fs.writeFile(path.join(root, 'src/two.js'), 'export const two = 1;\n');
  git(root, 'add', 'src/two.js');
  git(root, 'commit', '-m', 'chore: add two');
  const base = git(root, 'rev-parse', 'HEAD');
  const baseline = path.join(root, '.exo', 'baseline.txt');
  await fs.mkdir(path.dirname(baseline), { recursive: true });
  await fs.writeFile(baseline, git(root, 'status', '--porcelain'));
  const slot = `${root}-task-1`;
  git(root, 'worktree', 'add', '--detach', slot, 'HEAD');
  await editApp(slot);
  await fs.writeFile(path.join(slot, 'src/two.js'), 'export const two = 2;\n');
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--slot', slot, '--base', base, '--baseline', baseline, '--in-flight', '1,2', '--report', '-'], { cwd: root, input: PASS_REPORT });
  assert.match(landed.stdout, /changed a path outside Files: `src\/two\.js`/);
  assert.doesNotMatch(landed.stdout, /left `src\/two\.js` for open Task 2/);
});
