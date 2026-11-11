import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { commonDir, createWorktree, isWorktreePath, mainCheckout, relativeFor, seedCaches, worktreePath } from '../lib/checkout.mjs';
import { withLandLock } from '../lib/land-lock.mjs';
import { applyPick } from '../lib/workspace.mjs';
import { removeWorktree, RemoveWorktreeError } from '../skills/build/scripts/remove-worktree.mjs';
import { openSlots } from '../skills/build/scripts/open-slots.mjs';
import { parsePlan } from '#plan-tasks';
import { planPrompt, taskPrompt } from '../skills/build/scripts/run-prompts.mjs';
import { git, gitRepository, tempDir } from './harness.mjs';

const SEED = { '.gitignore': '.env*\n', 'README.md': 'seed\n' };

async function repositoryWithWorktree() {
  const root = await gitRepository(SEED);
  const worktree = path.join(root, '.worktrees', 'topic');
  git(root, 'worktree', 'add', '-q', '-b', 'topic', worktree);
  return { root, worktree };
}

async function envRepository(setting) {
  const root = await gitRepository(SEED);
  await fs.writeFile(path.join(root, '.env'), 'TOKEN=1\n');
  await fs.mkdir(path.join(root, '.claude'), { recursive: true });
  await fs.writeFile(path.join(root, '.claude', 'exo.local.json'), JSON.stringify({ env: setting }));
  return { root, where: path.join(root, '.worktrees', 'topic') };
}

test('mainCheckout from inside a linked worktree is the main checkout', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  assert.equal(mainCheckout(worktree), root);
  assert.equal(mainCheckout(root), root);
});

test('commonDir from inside a linked worktree is the absolute git directory of the main checkout', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  assert.equal(commonDir(worktree), path.join(root, '.git'));
});

test('commonDir and mainCheckout are null outside a repository', async () => {
  const outside = await fs.realpath(tempDir());
  assert.equal(commonDir(outside), null);
  assert.equal(mainCheckout(outside), null);
});

test('relativeFor gives a path below the root and a dot for the root itself', () => {
  const root = path.join(os.tmpdir(), 'app');
  assert.equal(relativeFor(root, path.join(root, 'docs', 'plan.md')), path.join('docs', 'plan.md'));
  assert.equal(relativeFor(root, root), '.');
});

test('createWorktree copies a gitignored .env when env is copy', async () => {
  const { root, where } = await envRepository('copy');
  const done = createWorktree(root, where, ['-q', '-b', 'topic', where]);
  assert.equal(done.ok, true);
  assert.equal(await fs.readFile(path.join(where, '.env'), 'utf8'), 'TOKEN=1\n');
});

test('createWorktree copies no .env when env is never', async () => {
  const { root, where } = await envRepository('never');
  const done = createWorktree(root, where, ['-q', '-b', 'topic', where]);
  assert.equal(done.ok, true);
  await assert.rejects(fs.access(path.join(where, '.env')));
});

test('createWorktree reports a failed git worktree add', async () => {
  const { root, where } = await envRepository('copy');
  const done = createWorktree(root, where, ['-q', where, 'no-such-branch']);
  assert.equal(done.ok, false);
  assert.notEqual(done.error, '');
});

test('createWorktree with env false copies no .env even when env is copy', async () => {
  const { root, where } = await envRepository('copy');
  const done = createWorktree(root, where, ['-q', '--detach', where, 'HEAD'], { env: false });
  assert.equal(done.ok, true);
  await assert.rejects(fs.access(path.join(where, '.env')));
});

test('openSlots leaves .env out of a slot when env is copy', async () => {
  const { root } = await envRepository('copy');
  const opened = openSlots({ root, numbers: [1], setup: 'none', fresh: true });
  assert.equal(opened.reason, undefined);
  await assert.rejects(fs.access(path.join(`${root}-task-1`, '.env')));
});

test('the land lock taken from a linked worktree lives under the common dir', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  let held = false;
  withLandLock(worktree, () => { held = existsSync(path.join(root, '.git', 'exo-land.lock')); });
  assert.equal(held, true);
});

test('applyPick worktree copies .env when env is copy', async () => {
  const { root } = await envRepository('copy');
  const target = applyPick('worktree', { dir: root, name: 'topic' });
  assert.equal(await fs.readFile(path.join(target, '.env'), 'utf8'), 'TOKEN=1\n');
});

const TASK_PLAN = `# Fixture

## Goal

The library exports \`capitalize\`.

## Plan basis

Land gate: none
Lint: none

## Success criterion

\`node --test\` passes.

## Tasks

### Task 1: Add capitalize

Files:
- Create: \`src/capitalize.js\`

Step 1: Write the module
Run: \`node --test src/capitalize.test.js\`
Expected: \`pass 1\`
`;

test('a headless task prompt names the checkout as "." and no absolute path or cd', async () => {
  const root = await fs.realpath(await gitRepository(SEED));
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo', 'run-rules.md'), 'rules\n');
  const planPath = path.join(tempDir(), 'plan.md');
  const text = taskPrompt({ plan: parsePlan(TASK_PLAN), planPath, number: 1, root, learnings: path.join(root, '.exo', 'learnings.md'), sandbox: false, runDir: null });
  assert.ok(!text.includes(root), text);
  assert.ok(!text.includes('cd '), text);
  assert.match(text, /--root \.`/);
  assert.match(text, /Work in \.; use relative paths/);
});

test('a headless plan prompt names its report and checks relative to the checkout', async () => {
  const root = await fs.realpath(await gitRepository(SEED));
  const planPath = path.join(tempDir(), 'plan.md');
  const text = planPrompt({ plan: parsePlan(TASK_PLAN), planPath, numbers: [1], root, sandbox: false });
  assert.ok(!text.includes(root), text);
  assert.ok(!text.includes('cd '), text);
  assert.match(text, /--report \.exo[\\/]implementer-1\.md/);
});

test('remove-worktree refuses an untracked file outside .exo and docs/specs and removes nothing', async () => {
  const { root, worktree } = await repositoryWithWorktree();
  await fs.writeFile(path.join(worktree, 'notes.txt'), 'notes\n');
  assert.throws(() => removeWorktree({ worktree, run: root }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /notes\.txt.*removed nothing/);
    return true;
  });
  assert.equal(existsSync(path.join(worktree, 'notes.txt')), true);
});

async function lockedRepository(worktreeLock) {
  const root = await gitRepository({ '.gitignore': 'node_modules/\n', 'package-lock.json': '{"a":1}\n' });
  await fs.mkdir(path.join(root, 'node_modules', 'dep'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules', 'dep', 'index.js'), 'x\n');
  const where = path.join(root, '.worktrees', 'topic');
  git(root, 'worktree', 'add', '-q', '-b', 'topic', where);
  if (worktreeLock) await fs.writeFile(path.join(where, 'package-lock.json'), worktreeLock);
  return { root, where };
}

test('createWorktree clones node_modules when the lockfile hash matches', async () => {
  const { root, where } = await lockedRepository();
  await fs.rm(where, { recursive: true, force: true });
  git(root, 'worktree', 'prune');
  const done = createWorktree(root, where, ['-q', '-b', 'again', where]);
  assert.equal(done.ok, true);
  assert.equal(await fs.readFile(path.join(where, 'node_modules', 'dep', 'index.js'), 'utf8'), 'x\n');
});

test('createWorktree seeds nothing when the lockfile hash differs', async () => {
  const { root, where } = await lockedRepository('{"a":2}\n');
  assert.deepEqual(seedCaches(root, where), []);
  assert.equal(existsSync(path.join(where, 'node_modules')), false);
});

test('worktreePath roots a slot beside its run worktree under the main checkout', async () => {
  const root = await gitRepository(SEED);
  const run = path.join(root, '.claude', 'worktrees', 'run');
  git(root, 'worktree', 'add', '-q', '-b', 'run', run);
  assert.equal(worktreePath('run-task-1', run), path.join(await fs.realpath(root), '.claude', 'worktrees', 'run-task-1'));
});

test('createWorktree excludes .claude/worktrees once when no rule covers it', async () => {
  const root = await gitRepository(SEED);
  const first = path.join(root, '.claude', 'worktrees', 'one');
  const second = path.join(root, '.claude', 'worktrees', 'two');
  createWorktree(root, first, ['-q', '-b', 'one', first]);
  createWorktree(root, second, ['-q', '-b', 'two', second]);
  const exclude = await fs.readFile(path.join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude.split('.claude/worktrees/').length - 1, 1);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('isWorktreePath matches both worktree folders and nothing else', () => {
  assert.equal(isWorktreePath('.claude/worktrees/run/a.js'), true);
  assert.equal(isWorktreePath('.worktrees/run'), true);
  assert.equal(isWorktreePath('.claude/commands/a.md'), false);
  assert.equal(isWorktreePath('src/worktrees/a.js'), false);
});

test('worktreePath without a directory fails at once', () => {
  assert.throws(() => worktreePath('run-task-1'));
});
