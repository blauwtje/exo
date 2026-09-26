// A worktree agent's scratch folder sits inside its own checkout, stays out of
// `git status` once scratch-exclude has run, and never blocks removing the
// worktree.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const SCRATCH_PATH = fileURLToPath(new URL('../lib/scratch-path.mjs', import.meta.url));
const SCRATCH_EXCLUDE = fileURLToPath(new URL('../lib/scratch-exclude.mjs', import.meta.url));

// A main checkout with one commit and a linked worktree beside it, the layout
// a worktree agent runs in.
async function repositoryWithWorktree() {
  const root = await gitRepository({ 'README.md': 'fixture\n' });
  const worktree = path.join(path.dirname(root), `${path.basename(root)}-linked`);
  git(root, 'worktree', 'add', '-q', '-b', 'run/linked', worktree);
  return { root, worktree: fs.realpathSync(worktree) };
}

function isInside(parent, child) {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

test('in a linked worktree the scratch folder is created inside that worktree', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  const result = await run(SCRATCH_PATH, [], { cwd: worktree });
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim();
  assert.ok(fs.statSync(printed).isDirectory());
  assert.equal(fs.realpathSync(printed), path.join(worktree, '.exo'));
  assert.ok(!isInside(root, printed), `${printed} lies in the main checkout`);
});

test('a sub path nests below the scratch folder and is created, repeatably', async () => {
  const { worktree } = await repositoryWithWorktree();
  const first = await run(SCRATCH_PATH, ['reports/review'], { cwd: worktree });
  assert.equal(first.code, 0, first.stderr);
  const printed = first.stdout.trim();
  assert.ok(fs.statSync(printed).isDirectory());
  assert.equal(fs.realpathSync(printed), path.join(worktree, '.exo', 'reports', 'review'));
  const second = await run(SCRATCH_PATH, ['reports/review'], { cwd: worktree });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout.trim(), printed);
});

test('a sub path whose last segment has an extension creates the parent folder, not the file', async () => {
  const { worktree } = await repositoryWithWorktree();
  const result = await run(SCRATCH_PATH, ['nested/report.md'], { cwd: worktree });
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim();
  assert.equal(printed, path.join(worktree, '.exo', 'nested', 'report.md'));
  assert.ok(fs.statSync(path.dirname(printed)).isDirectory());
  assert.ok(!fs.existsSync(printed));
  fs.writeFileSync(printed, 'findings\n');
  assert.equal(fs.readFileSync(printed, 'utf8'), 'findings\n');
});

test('a sub path whose last segment has no extension still creates and returns a folder', async () => {
  const { worktree } = await repositoryWithWorktree();
  const result = await run(SCRATCH_PATH, ['nested/debug'], { cwd: worktree });
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim();
  assert.equal(printed, path.join(worktree, '.exo', 'nested', 'debug'));
  assert.ok(fs.statSync(printed).isDirectory());
});

test('a sub path that climbs out or is absolute is refused with one stderr line', async () => {
  const { worktree } = await repositoryWithWorktree();
  for (const sub of ['..', '../escape', 'reports/../../escape', path.join(worktree, 'elsewhere')]) {
    const result = await run(SCRATCH_PATH, [sub], { cwd: worktree });
    assert.notEqual(result.code, 0, `${sub} was accepted`);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  }
  assert.ok(!fs.existsSync(path.join(path.dirname(worktree), 'escape')));
});

test('outside a git repository scratch-path fails with one stderr line', async () => {
  const outside = fs.realpathSync(await fixture());
  const result = await run(SCRATCH_PATH, [], { cwd: outside });
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  assert.ok(!fs.existsSync(path.join(outside, '.exo')));
});

test('after scratch-exclude the worktree scratch folder stays out of git status', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  const exclude = await run(SCRATCH_EXCLUDE, [], { cwd: root });
  assert.equal(exclude.code, 0, exclude.stderr);
  const scratch = (await run(SCRATCH_PATH, [], { cwd: worktree })).stdout.trim();
  fs.writeFileSync(path.join(scratch, 'report.md'), 'findings\n');
  assert.equal(git(worktree, 'status', '--porcelain', '--untracked-files=all'), '');
});

test('scratch-exclude writes the line once however often it runs, from either checkout', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  const excludeFile = path.join(root, '.git', 'info', 'exclude');
  fs.rmSync(path.dirname(excludeFile), { recursive: true, force: true });
  for (const cwd of [root, root, worktree]) {
    const result = await run(SCRATCH_EXCLUDE, [], { cwd });
    assert.equal(result.code, 0, result.stderr);
  }
  const lines = fs.readFileSync(excludeFile, 'utf8').split('\n');
  assert.equal(lines.filter((line) => line === '.exo/').length, 1);
  assert.equal(lines.at(-1), '', 'the file ends in a newline');
});

test('scratch-exclude starts a new line after a last line without a newline', async () => {
  const { root } = await repositoryWithWorktree();
  const excludeFile = path.join(root, '.git', 'info', 'exclude');
  fs.writeFileSync(excludeFile, '*.log');
  const result = await run(SCRATCH_EXCLUDE, [], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(fs.readFileSync(excludeFile, 'utf8'), '*.log\n.exo/\n');
});

test('a worktree holding an excluded scratch file is still removed without --force', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  await run(SCRATCH_EXCLUDE, [], { cwd: root });
  const scratch = (await run(SCRATCH_PATH, ['reports'], { cwd: worktree })).stdout.trim();
  fs.writeFileSync(path.join(scratch, 'report.md'), 'findings\n');
  git(root, 'worktree', 'remove', worktree);
  assert.ok(!fs.existsSync(worktree));
});
