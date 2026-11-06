import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { git, run, tempDir } from './harness.mjs';
import { landingCheckout, editApp } from './land-task-fixture.mjs';

const LAND_SLOT = new URL('../skills/build/scripts/land-slot.mjs', import.meta.url).pathname;
const LAND_CONFLICT = new URL('../skills/build/scripts/conflict-wave.mjs', import.meta.url).pathname;
const OTHER = 'export function greet() {\n  return "other";\n}\n';

async function conflictedWave(env) {
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
  await editApp(slot);
  await fs.writeFile(path.join(root, 'src/app.js'), OTHER);
  git(root, 'commit', '-q', '-am', 'chore: diverge');
  const args = ['--plan', planPath, '--task', '1', '--root', root, '--slot', slot, '--base', base, '--baseline', baseline, '--in-flight', '3'];
  const land = await run(LAND_SLOT, args, { cwd: root, env: { HOME: tempDir('exo-home-'), ...env } });
  return { root, planPath, land, head: git(root, 'rev-parse', 'HEAD') };
}

const finish = (root, planPath) => run(LAND_CONFLICT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });

test('with the resolver on a conflicted land keeps the pick on exo-conflict-1 with diffs and a resolver line', async () => {
  const { root, land, head } = await conflictedWave({ EXO_WAVE_RESOLVER: '1' });
  assert.equal(land.code, 0, land.stderr);
  assert.match(land.stdout, /^CONFLICT 1\b/);
  assert.match(land.stdout, /^Conflict branch: exo-conflict-1$/m);
  assert.match(land.stdout, /^Conflict files: src\/app\.js$/m);
  assert.match(land.stdout, /^Dispatch: exo:build-task$/m);
  assert.match(land.stdout, /^Then: node .*conflict-wave\.mjs/m);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(git(root, 'status', '--porcelain'), '');
  const folder = path.join(root, '.exo', 'conflict-1');
  assert.ok((await fs.readFile(path.join(folder, 'ours.diff'), 'utf8')).includes('other'));
  assert.ok((await fs.readFile(path.join(folder, 'theirs.diff'), 'utf8')).length > 0);
  assert.match(git(root, 'branch', '--list', 'exo-conflict-1'), /exo-conflict-1/);
});

test('with the resolver off a conflicted land leaves no conflict branch', async () => {
  const { root, land } = await conflictedWave({ EXO_WAVE_RESOLVER: '0' });
  assert.match(land.stdout, /^CONFLICT 1\b/);
  assert.doesNotMatch(land.stdout, /Conflict branch:/);
  assert.equal(git(root, 'branch', '--list', 'exo-conflict-1'), '');
});

test('a branch that still holds markers stops naming the branch and lands nothing', async () => {
  const { root, planPath, head } = await conflictedWave({ EXO_WAVE_RESOLVER: '1' });
  const result = await finish(root, planPath);
  assert.match(result.stdout, /^CONFLICT 1: branch exo-conflict-1 still has conflict markers in src\/app\.js/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('a resolved branch lands as one commit with the picked message', async () => {
  const { root, planPath, head } = await conflictedWave({ EXO_WAVE_RESOLVER: '1' });
  await fs.writeFile(path.join(root, '.exo', 'conflict-1', 'tree', 'src/app.js'), OTHER.replace('other', 'merged'));
  const result = await finish(root, planPath);
  assert.match(result.stdout, /^LANDED 1 [0-9a-f]{40}\b/, result.stderr);
  assert.equal(git(root, 'rev-parse', 'HEAD~1'), head);
  assert.equal(git(root, 'branch', '--list', 'exo-conflict-1'), '');
});
