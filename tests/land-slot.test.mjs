
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeBuildProgress } from '../lib/build-progress.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { git, run } from './harness.mjs';
import { landingCheckout, editApp } from './land-task-fixture.mjs';

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

test('a refused landing keeps the slot and puts nothing on the run branch', async () => {
  const { root, slot, land } = await slotFixture();
  const head = git(root, 'rev-parse', 'HEAD');
  await editApp(slot);
  await fs.writeFile(path.join(slot, 'src/extra.js'), 'export const extra = 1;\n');
  const result = await land();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^REFUSED 1\b.*outside Files/s);
  assert.match(result.stdout, /^Start: none$/m);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(worktrees(root), new RegExp(slot));
});

test('a refused landing prints a Wait: and Land: for the rebuild into the same slot, since the refusal', async () => {
  const { root, slot, land, base } = await slotFixture();
  const other = `${root}-task-3`;
  const window = path.join(root, '.exo', 'window.json');
  await fs.writeFile(window, JSON.stringify({ 1: { slot, base, since: 1000000000 }, 3: { slot: other, base, since: 1000000003 } }));
  await editApp(slot);
  await fs.writeFile(path.join(slot, 'src/extra.js'), 'export const extra = 1;\n');
  const before = Math.floor(Date.now() / 1000);
  const result = await land();
  assert.match(result.stdout, /^REFUSED 1\b/);
  const wait = result.stdout.match(/^Wait: node ".+wait-report\.mjs" --any --since (\d{10}) --report "(.+)" --stamp "(.+)" --since 1000000003 --report "(.+)" --stamp "(.+)"   \(/m);
  assert.ok(wait, result.stdout);
  assert.ok(Number(wait[1]) >= before, `since ${wait[1]} is before the refusal at ${before}`);
  assert.equal(wait[2], path.join(slot, '.exo', 'implementer-1.md'));
  assert.equal(wait[3], path.join(slot, '.exo', 'checked-1'));
  assert.equal(wait[4], path.join(other, '.exo', 'implementer-3.md'));
  assert.equal(wait[5], path.join(other, '.exo', 'checked-3'));
  assert.match(result.stdout, new RegExp(`^Land 1: node ".+land-slot\\.mjs" .*--task 1 .*--slot "${slot}" --base ${base} .*--in-flight 3$`, 'm'));
  assert.equal(JSON.parse(await fs.readFile(window, 'utf8'))[1].since, Number(wait[1]));
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
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-progress-'));
  const env = { XDG_CACHE_HOME: cache, CLAUDE_CODE_SESSION_ID: 'sess-1' };
  writeBuildProgress({ sessionId: 'sess-1', plan: path.join(root, 'docs/plans/fixture.md'), checkout: root, landed: 0, total: 4 }, { env, now: 1000 });
  await editApp(slot);
  const result = await land(['--in-flight', '3'], env);
  assert.equal(result.code, 0, result.stderr);
  const record = JSON.parse(await fs.readFile(path.join(cache, 'exo', 'build', 'sess-1.json'), 'utf8'));
  assert.equal(record.landed, 1);
  assert.equal(record.total, 4);
});
