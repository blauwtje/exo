// start-run.mjs picks the plan build's step 1 should run by matching a
// plan's `Repository:` and `Branch:` lines against the checkout and excludes
// the scratch folder.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/start-run.mjs', import.meta.url));

function plan(repository, branch) {
  return [
    '# Plan: fixture',
    '',
    '## Goal',
    '',
    'The fixture proves the plan picker.',
    '',
    '## Plan basis',
    '',
    `Repository: ${repository}`,
    `Branch: ${branch}`,
    '',
    '## Tasks',
    ''
  ].join('\n');
}

// An empty ~/.claude/plans, isolated per test, so a run never scans the
// machine's real plans while it looks for the fixture's own.
async function noHomePlans() {
  return fixture();
}

test('picks the sole plan matching the repository and branch, and excludes the scratch folder', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `start-run: run started: plan ${path.join(root, 'docs/plans/one.md')}, checkout ${root} on branch main. Step 1 is done; never rerun start-run in this run.\n`);

  const exclude = await fs.readFile(path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'info', 'exclude'), 'utf8');
  assert.match(exclude, /^\.exo\/$/m);
});

test('a --checkout flag names the run checkout', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const checkout = await gitRepository({ 'README.md': 'x' });

  const result = await run(SCRIPT, ['--root', root, '--checkout', checkout], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(`checkout ${checkout} on branch main.`), result.stdout);
});

test('prefers the plan whose Branch matches the current branch', async () => {
  const root = await gitRepository({
    'docs/plans/other-branch.md': 'placeholder',
    'docs/plans/this-branch.md': 'placeholder'
  });
  await fs.writeFile(path.join(root, 'docs/plans/other-branch.md'), plan(root, 'feat/elsewhere'));
  await fs.writeFile(path.join(root, 'docs/plans/this-branch.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(`plan ${path.join(root, 'docs/plans/this-branch.md')},`), result.stdout);
});

test('exits 1 with one line when no plan matches the repository', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan('/tmp/some-other-repo', 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^start-run: no plan under docs\/plans\/, docs\/specs\/ or ~\/\.claude\/plans\/ names Repository: .*. Next: rerun with --plan <path> naming the plan\.\n$/);
});

test('exits 1 with one line when several plans still match after the branch preference', async () => {
  const root = await gitRepository({
    'docs/plans/a.md': 'placeholder',
    'docs/plans/b.md': 'placeholder'
  });
  await fs.writeFile(path.join(root, 'docs/plans/a.md'), plan(root, 'main'));
  await fs.writeFile(path.join(root, 'docs/plans/b.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^start-run: 2 plans name Repository: .*. Next: ask which plan runs, then rerun with --plan <that path>\.\n$/);
});

test('a --plan flag skips the search, even where several plans match, and prints its absolute path', async () => {
  const root = await gitRepository({
    'docs/plans/a.md': 'placeholder',
    'docs/plans/b.md': 'placeholder'
  });
  await fs.writeFile(path.join(root, 'docs/plans/a.md'), plan(root, 'main'));
  await fs.writeFile(path.join(root, 'docs/plans/b.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--plan', 'docs/plans/b.md'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(`plan ${path.join(root, 'docs/plans/b.md')},`), result.stdout);
});

test('--find-only prints the resolved plan and its Repository: and Branch: lines, before the checkout is known', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--find-only'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `${path.join(root, 'docs/plans/one.md')}\nRepository: ${root}\nBranch: main\n`);
});

test('--find-only still exits 1 with one line when no plan matches', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan('/tmp/some-other-repo', 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--find-only'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
});

test('a checkout on another branch than the plan names still starts, with the exact switch command and no rerun', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'feat/text-helpers'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--plan', 'docs/plans/one.md', '--checkout', root], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  const [done, note] = result.stdout.trimEnd().split('\n');
  assert.match(done, /^start-run: run started: .* on branch main\. Step 1 is done; never rerun start-run in this run\.$/);
  assert.equal(note, `start-run: note: checkout ${root} is on main, not the plan's Branch: feat/text-helpers. If the workspace answer is feat/text-helpers, run \`git -C ${root} switch -c feat/text-helpers\` and do not rerun start-run.`);
});

test('refuses a --checkout that is not a git checkout, naming the next command', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();
  const missing = path.join(root, 'no-such-worktree');

  const result = await run(SCRIPT, ['--root', root, '--plan', 'docs/plans/one.md', '--checkout', missing], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `start-run: --checkout ${missing} is not a git checkout. Next: create it as the workspace answer says, then rerun with --checkout <that path>.\n`);
});

test('an unknown flag prints the usage line and exits 2', async () => {
  const result = await run(SCRIPT, ['--help']);
  assert.equal(result.code, 2);
  assert.equal(result.stderr, "start-run: unknown flag '--help'\nusage: node start-run.mjs --find-only | --plan <path> --checkout <run-checkout> [--root <checkout>]\n");
});
