// start-run.mjs picks the plan build's step 1 should run by matching a
// plan's `Repository:` and `Branch:` lines against the checkout, writes the
// four-line `build.active` marker and excludes the scratch folder.

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

async function markerLines(root) {
  const markerPath = path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.active');
  return (await fs.readFile(markerPath, 'utf8')).split('\n');
}

test('picks the sole plan matching the repository and branch, and writes the marker', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--session', 'sess-1'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, `start-run: run started, marker written: plan ${path.join(root, 'docs/plans/one.md')}, checkout ${root} on branch main, session sess-1. Step 1 is done; never rerun start-run in this run.\n`);

  const [planLine, checkoutLine, sessionLine, writtenAt] = await markerLines(root);
  assert.equal(planLine, path.join(root, 'docs/plans/one.md'));
  assert.equal(checkoutLine, root);
  assert.equal(sessionLine, 'sess-1');
  assert.ok(!Number.isNaN(Date.parse(writtenAt)));

  const exclude = await fs.readFile(path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'info', 'exclude'), 'utf8');
  assert.match(exclude, /^\.exo\/$/m);
});

test('falls back to CLAUDE_CODE_SESSION_ID when no --session is given, the name a Bash call carries', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root], { cwd: root, env: { HOME: home, CLAUDE_CODE_SESSION_ID: 'bash-sess-9' } });
  assert.equal(result.code, 0, result.stderr);
  const [, , sessionLine] = await markerLines(root);
  assert.equal(sessionLine, 'bash-sess-9');
});

test('a --checkout flag overrides the marker\'s second line', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const checkout = await gitRepository({ 'README.md': 'x' });

  const result = await run(SCRIPT, ['--root', root, '--checkout', checkout], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  const [, checkoutLine] = await markerLines(root);
  assert.equal(checkoutLine, checkout);
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
  assert.match(result.stderr, /^start-run: no plan under docs\/plans\/, docs\/specs\/ or ~\/\.claude\/plans\/ names Repository: .*; no marker written\. Next: rerun with --plan <path> naming the plan\.\n$/);
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
  assert.match(result.stderr, /^start-run: 2 plans name Repository: .*; no marker written\. Next: ask which plan runs, then rerun with --plan <that path>\.\n$/);
});

test('a --plan flag skips the search, even where several plans match, and writes its absolute path to the marker', async () => {
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
  const [planLine] = await markerLines(root);
  assert.equal(planLine, path.join(root, 'docs/plans/b.md'));
});

test('--find-only prints the resolved plan and writes no marker, before the checkout is known', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--find-only'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(root, 'docs/plans/one.md'));
  await assert.rejects(fs.access(path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.active')));
});

test('--find-only still exits 1 with one line when no plan matches', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan('/tmp/some-other-repo', 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--find-only'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
});

test('an empty --session, an unset shell variable, falls back to CLAUDE_CODE_SESSION_ID', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--session', ''], { cwd: root, env: { HOME: home, CLAUDE_CODE_SESSION_ID: 'bash-sess-9' } });
  assert.equal(result.code, 0, result.stderr);
  const [, , sessionLine] = await markerLines(root);
  assert.equal(sessionLine, 'bash-sess-9');
  assert.match(result.stdout, /, session bash-sess-9\. /);
});

test('a checkout on another branch than the plan names still starts, with the exact switch command and no rerun', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'feat/text-helpers'));
  const home = await noHomePlans();

  const result = await run(SCRIPT, ['--root', root, '--plan', 'docs/plans/one.md', '--checkout', root, '--session', 's'], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 0, result.stderr);
  const [done, note] = result.stdout.trimEnd().split('\n');
  assert.match(done, /^start-run: run started, marker written: .* on branch main, session s\. Step 1 is done; never rerun start-run in this run\.$/);
  assert.equal(note, `start-run: note: checkout ${root} is on main, not the plan's Branch: feat/text-helpers. The marker names no branch, so if the workspace answer is feat/text-helpers, run \`git -C ${root} switch -c feat/text-helpers\` and do not rerun start-run.`);
  const [planLine] = await markerLines(root);
  assert.equal(planLine, path.join(root, 'docs/plans/one.md'));
});

test('refuses a --checkout that is not a git checkout, naming the next command, and writes no marker', async () => {
  const root = await gitRepository({ 'docs/plans/one.md': 'placeholder' });
  await fs.writeFile(path.join(root, 'docs/plans/one.md'), plan(root, 'main'));
  const home = await noHomePlans();
  const missing = path.join(root, 'no-such-worktree');

  const result = await run(SCRIPT, ['--root', root, '--plan', 'docs/plans/one.md', '--checkout', missing], { cwd: root, env: { HOME: home } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `start-run: --checkout ${missing} is not a git checkout; no marker written. Next: create it as the workspace answer says, then rerun with --checkout <that path>.\n`);
  await assert.rejects(fs.access(path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'build.active')));
});

test('an unknown flag prints the usage line and exits 2', async () => {
  const result = await run(SCRIPT, ['--help']);
  assert.equal(result.code, 2);
  assert.equal(result.stderr, "start-run: unknown flag '--help'\nusage: node start-run.mjs --find-only | --plan <path> --checkout <run-checkout> [--session <id>] [--root <checkout>]\n");
});
