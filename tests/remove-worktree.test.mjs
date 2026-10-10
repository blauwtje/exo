// remove-worktree.mjs copies a worktree's .exo/ files into the run's .exo/
// (or, with --kept, into .exo/kept/<name>/, first moving an existing folder of
// that name to <name>-<stamp>/) and every docs/specs/ file git does not track
// into .exo/kept/<name>/docs/specs/ before it removes the worktree, and refuses
// to remove it, with any moved kept folder back in place, when a copy fails or
// git refuses; when git removed part of it, both kept folders stay.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { removeWorktree, RemoveWorktreeError } from '../skills/build/scripts/remove-worktree.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { git, gitRepository } from './harness.mjs';

// `.exo/` is excluded (lib/scratch-exclude.mjs), not gitignored, the same as a
// real wave worktree, so `git worktree remove` sees it as clean rather than
// refusing over an "untracked" .exo/ file.
async function runWithWorktree(files = {}) {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', ...files });
  excludeScratch(root);
  const worktree = `${root}-task-1`;
  git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  return { root, worktree };
}

test('copies the worktree .exo/ files into the run and removes the worktree', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'top level\n');
  fs.writeFileSync(path.join(worktree, '.exo', 'sub', 'note.md'), 'nested\n');

  const output = removeWorktree({ worktree, run: root });

  assert.match(output, /Copied 2 \.exo\/ file\(s\)/);
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'report.md'), 'utf8'), 'top level\n');
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'sub', 'note.md'), 'utf8'), 'nested\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('refuses and removes nothing when a copy fails', { skip: process.getuid?.() === 0 }, async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'blocked\n');
  fs.mkdirSync(path.join(root, '.exo'), { recursive: true, mode: 0o555 });

  try {
    assert.throws(() => removeWorktree({ worktree, run: root }), RemoveWorktreeError);
    assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));
    assert.equal(fs.existsSync(path.join(root, '.exo', 'report.md')), false);
  } finally {
    fs.chmodSync(path.join(root, '.exo'), 0o755);
  }
});

test('--kept copies into .exo/kept/<name>/ and leaves the run .exo/ untouched', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'branch-review.md'), 'from the worktree\n');
  fs.mkdirSync(path.join(root, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.exo', 'branch-review.md'), 'the run own\n');

  const output = removeWorktree({ worktree: `${worktree}/`, run: root, kept: true });

  const kept = path.join(root, '.exo', 'kept', path.basename(worktree));
  assert.match(output, new RegExp(`to '${kept}/'`));
  assert.equal(fs.readFileSync(path.join(kept, 'branch-review.md'), 'utf8'), 'from the worktree\n');
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'branch-review.md'), 'utf8'), 'the run own\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

// Two worktrees named `task` under different parents, each holding one
// `.exo/task-1.patch` that names its own worktree.
async function runWithTwoSameNamedWorktrees() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  excludeScratch(root);
  const first = path.join(`${root}-a`, 'task');
  const second = path.join(`${root}-b`, 'task');
  for (const worktree of [first, second]) {
    git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
    fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
    fs.writeFileSync(path.join(worktree, '.exo', 'task-1.patch'), `from ${worktree}\n`);
  }
  return { root, first, second };
}

test('--kept moves an existing same-named folder to a stamped one and removes the second worktree', async () => {
  const { root, first, second } = await runWithTwoSameNamedWorktrees();
  removeWorktree({ worktree: first, run: root, kept: true });

  const output = removeWorktree({ worktree: second, run: root, kept: true });

  const keptRoot = path.join(root, '.exo', 'kept');
  const stamped = fs.readdirSync(keptRoot).filter((name) => /^task-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(name));
  assert.equal(stamped.length, 1);
  assert.match(output, new RegExp(`moved existing '.*/kept/task/' to '.*/kept/${stamped[0]}/'`));
  assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'task-1.patch'), 'utf8'), `from ${second}\n`);
  assert.equal(fs.readFileSync(path.join(keptRoot, stamped[0], 'task-1.patch'), 'utf8'), `from ${first}\n`);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(second));
});

test('--kept git refusal after a move restores the existing folder and leaves no stamped one', async () => {
  const { root, first, second } = await runWithTwoSameNamedWorktrees();
  removeWorktree({ worktree: first, run: root, kept: true });
  fs.writeFileSync(path.join(second, 'src', 'app.js'), 'dirty\n');

  assert.throws(() => removeWorktree({ worktree: second, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /git refused to remove .*contains modified or untracked files/);
    return true;
  });
  const keptRoot = path.join(root, '.exo', 'kept');
  assert.deepEqual(fs.readdirSync(keptRoot), ['task']);
  assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'task-1.patch'), 'utf8'), `from ${first}\n`);
  assert.match(git(root, 'worktree', 'list'), new RegExp(second));
});

test('--kept with no .exo/ files creates no folder and still removes the worktree', async () => {
  const { root, worktree } = await runWithWorktree();

  removeWorktree({ worktree, run: root, kept: true });

  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept')), false);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('--kept turns git refusal into a RemoveWorktreeError, drops its copy and allows a retry', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'kept me\n');
  fs.writeFileSync(path.join(worktree, 'src', 'app.js'), 'dirty\n');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /git refused to remove .*contains modified or untracked files/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept', path.basename(worktree))), false);
  assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));

  git(worktree, 'checkout', '--', 'src/app.js');
  removeWorktree({ worktree, run: root, kept: true });
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'kept', path.basename(worktree), 'report.md'), 'utf8'), 'kept me\n');
});

test('copies a .exo/ file whose name has a space', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'my report.md'), 'spaced\n');

  removeWorktree({ worktree, run: root });

  assert.equal(fs.readFileSync(path.join(root, '.exo', 'my report.md'), 'utf8'), 'spaced\n');
});

function writeFile(root, relative, content) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
}

// A `.gitignore` of `docs/*`, the same as this repository's, makes a spec
// brief under `docs/specs/` ignored, so `git worktree remove` deletes it
// without refusing.
const IGNORED_DOCS = { '.gitignore': 'docs/*\n' };

test('--kept keeps an ignored docs/specs/ brief in .exo/kept/<name>/docs/specs/ and removes the worktree', async () => {
  const { root, worktree } = await runWithWorktree(IGNORED_DOCS);
  writeFile(worktree, '.exo/report.md', 'report\n');
  writeFile(worktree, 'docs/specs/topic.md', 'the brief\n');
  writeFile(worktree, 'docs/specs/deep/notes.md', 'nested\n');

  const output = removeWorktree({ worktree, run: root, kept: true });

  const kept = path.join(root, '.exo', 'kept', path.basename(worktree));
  assert.match(output, new RegExp(`Copied 1 \\.exo/ file\\(s\\) .*; kept 2 docs/specs/ file\\(s\\) in '${kept}/docs/specs/'; removed`));
  assert.equal(fs.readFileSync(path.join(kept, 'report.md'), 'utf8'), 'report\n');
  assert.equal(fs.readFileSync(path.join(kept, 'docs', 'specs', 'topic.md'), 'utf8'), 'the brief\n');
  assert.equal(fs.readFileSync(path.join(kept, 'docs', 'specs', 'deep', 'notes.md'), 'utf8'), 'nested\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('without --kept keeps an ignored docs/specs/ brief in .exo/kept/<name>/docs/specs/ and the .exo/ files in the run .exo/', async () => {
  const { root, worktree } = await runWithWorktree(IGNORED_DOCS);
  writeFile(worktree, '.exo/report.md', 'report\n');
  writeFile(worktree, 'docs/specs/topic.md', 'the brief\n');

  const output = removeWorktree({ worktree, run: root });

  const kept = path.join(root, '.exo', 'kept', path.basename(worktree));
  assert.match(output, new RegExp(`; kept 1 docs/specs/ file\\(s\\) in '${kept}/docs/specs/'`));
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'report.md'), 'utf8'), 'report\n');
  assert.equal(fs.readFileSync(path.join(kept, 'docs', 'specs', 'topic.md'), 'utf8'), 'the brief\n');
  assert.deepEqual(fs.readdirSync(kept), ['docs']);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('without --kept moves an existing kept folder aside before keeping a brief', async () => {
  const { root, worktree } = await runWithWorktree(IGNORED_DOCS);
  const keptRoot = path.join(root, '.exo', 'kept');
  writeFile(keptRoot, `${path.basename(worktree)}/earlier.md`, 'earlier\n');
  writeFile(worktree, 'docs/specs/topic.md', 'the brief\n');

  const output = removeWorktree({ worktree, run: root });

  const stamped = fs.readdirSync(keptRoot).filter((name) => name !== path.basename(worktree));
  assert.equal(stamped.length, 1);
  assert.match(output, new RegExp(`moved existing '.*/kept/${path.basename(worktree)}/' to '.*/kept/${stamped[0]}/'`));
  assert.equal(fs.readFileSync(path.join(keptRoot, stamped[0], 'earlier.md'), 'utf8'), 'earlier\n');
  assert.equal(fs.readFileSync(path.join(keptRoot, path.basename(worktree), 'docs', 'specs', 'topic.md'), 'utf8'), 'the brief\n');
});

test('leaves a tracked docs/specs/ file to git and keeps only the untracked one', async () => {
  const { root, worktree } = await runWithWorktree({ 'docs/specs/tracked.md': 'tracked\n' });
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), 'docs/*\n');
  writeFile(worktree, 'docs/specs/topic.md', 'the brief\n');

  const output = removeWorktree({ worktree, run: root });

  const specs = path.join(root, '.exo', 'kept', path.basename(worktree), 'docs', 'specs');
  assert.match(output, /; kept 1 docs\/specs\/ file\(s\)/);
  assert.deepEqual(fs.readdirSync(specs), ['topic.md']);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('a tracked docs/specs/ file alone keeps nothing and leaves the message unchanged', async () => {
  const { root, worktree } = await runWithWorktree({ 'docs/specs/tracked.md': 'tracked\n' });

  const output = removeWorktree({ worktree, run: root });

  assert.equal(output, `Copied 0 .exo/ file(s) from '${worktree}' to '${root}'; removed '${worktree}'\n`);
  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept')), false);
});

test('git refusal over an untracked brief leaves no kept folder, and --force keeps the brief', async () => {
  const { root, worktree } = await runWithWorktree();
  writeFile(worktree, 'docs/specs/topic.md', 'untracked brief\n');

  assert.throws(() => removeWorktree({ worktree, run: root }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /git refused to remove .*contains modified or untracked files/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept', path.basename(worktree))), false);
  assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));

  removeWorktree({ worktree, run: root, force: true });

  const brief = path.join(root, '.exo', 'kept', path.basename(worktree), 'docs', 'specs', 'topic.md');
  assert.equal(fs.readFileSync(brief, 'utf8'), 'untracked brief\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

// A read-only parent lets git delete every file inside the worktree and
// then fail on the worktree folder itself, whatever order readdir gives.
test('--kept keeps the copy and the moved-aside folder when git removes part of the worktree', { skip: process.getuid?.() === 0 || process.platform === 'win32' }, async () => {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', ...IGNORED_DOCS });
  excludeScratch(root);
  const parent = `${root}-locked`;
  const worktree = path.join(parent, 'task');
  git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  const keptRoot = path.join(root, '.exo', 'kept');
  writeFile(keptRoot, 'task/earlier.md', 'earlier\n');
  writeFile(worktree, '.exo/report.md', 'report\n');
  writeFile(worktree, 'docs/specs/topic.md', 'the brief\n');
  fs.chmodSync(parent, 0o555);

  try {
    assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), (error) => {
      assert.ok(error instanceof RemoveWorktreeError);
      assert.match(error.message, new RegExp(`git removed part of '${worktree}'.*; the copy stays in '${path.join(keptRoot, 'task')}/'`));
      return true;
    });
    assert.equal(fs.existsSync(path.join(worktree, 'docs', 'specs', 'topic.md')), false);
    assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'docs', 'specs', 'topic.md'), 'utf8'), 'the brief\n');
    assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'report.md'), 'utf8'), 'report\n');
    const stamped = fs.readdirSync(keptRoot).filter((name) => name !== 'task');
    assert.equal(stamped.length, 1);
    assert.equal(fs.readFileSync(path.join(keptRoot, stamped[0], 'earlier.md'), 'utf8'), 'earlier\n');
  } finally {
    fs.chmodSync(parent, 0o755);
  }
});

test('git refusal restores an existing kept folder moved aside for a brief', async () => {
  const { root, worktree } = await runWithWorktree();
  const keptRoot = path.join(root, '.exo', 'kept');
  writeFile(keptRoot, `${path.basename(worktree)}/earlier.md`, 'earlier\n');
  writeFile(worktree, 'docs/specs/topic.md', 'untracked brief\n');

  assert.throws(() => removeWorktree({ worktree, run: root }), RemoveWorktreeError);

  assert.deepEqual(fs.readdirSync(keptRoot), [path.basename(worktree)]);
  assert.deepEqual(fs.readdirSync(path.join(keptRoot, path.basename(worktree))), ['earlier.md']);
  assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));
});
