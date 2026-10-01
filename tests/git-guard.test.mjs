// The git guard denies a Bash command that force pushes, hard resets, force
// cleans, drops a stash, restores the whole tree or force-deletes a branch with
// unlanded commits, matches the words that run and not the words in a commit
// message, passes every other tool, and stands down when the guards setting is off.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/git-guard.mjs', import.meta.url));

// A `gh` first on PATH that answers `pr view` with `state`, or fails when it is
// null, so no test reaches the real GitHub CLI.
async function fakeGh(state) {
  const directory = await fixture();
  const body = state === null ? 'exit 1' : `echo ${state}`;
  const file = path.join(directory, 'gh');
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return directory;
}

async function guard(hookInput, { env = {}, input = JSON.stringify(hookInput), ghState = null } = {}) {
  const directory = await fixture();
  const ghDirectory = await fakeGh(ghState);
  return run(GUARD, [], {
    cwd: directory,
    input,
    env: {
      CLAUDE_CONFIG_DIR: directory,
      CLAUDE_PROJECT_DIR: directory,
      PATH: `${ghDirectory}${path.delimiter}${process.env.PATH}`,
      ...env
    }
  });
}

async function reason(command, options) {
  const outcome = await guard({ tool_name: 'Bash', tool_input: { command } }, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
}

async function assertDenied(commands, pattern) {
  for (const command of commands) {
    assert.match(await reason(command), pattern, command);
  }
}

async function assertAllowed(commands) {
  for (const command of commands) {
    assert.equal(await reason(command), null, command);
  }
}

// A repository on `main` with one commit.
async function repository() {
  const root = await fixture();
  git(root, 'init', '-q', '-b', 'main');
  await commitFiles(root, { 'base.txt': 'base\n' }, 'base');
  return root;
}

test('a force push is denied and --force-with-lease is not', async () => {
  await assertDenied([
    'git push --force',
    'git push -f origin main',
    'git push origin main --force',
    'git --no-pager push -f',
    'git -C /tmp/repo -c core.x=y push --force origin main',
    'make && git push -f',
    'git push origin "--force"',
    'git push origin +main',
    'git push origin +HEAD:main',
    'git push origin feature +main',
    'git push -fu origin main',
    'git push -uf origin main',
    'git push -fv'
  ], /force push/);
  await assertAllowed([
    'git push --force-with-lease',
    'git push -u --force-with-lease origin main',
    'git push --force-with-lease origin main',
    'git push origin main',
    'git push -u origin feature'
  ]);
});

test('deleting or mirroring remote refs is denied, an ordinary push is not', async () => {
  await assertDenied([
    'git push origin :main',
    'git push origin --delete main',
    'git push -d origin main',
    'git push --mirror'
  ], /remote refs/);
  await assertAllowed(['git push origin HEAD:main', 'git push -u origin feature', 'git push --force-with-lease=main:abc123 origin main', 'git push origin --delete audit2', 'git push origin :audit2', 'git push -d origin audit2']);
});

test('a forced checkout or switch is denied, its plain forms are not', async () => {
  await assertDenied([
    'git checkout -f',
    'git checkout -f main',
    'git checkout --force main',
    'git checkout -fb feature',
    'git switch -f x',
    'git switch --force x',
    'git switch --discard-changes x'
  ], /forced checkout/);
  await assertAllowed(['git checkout main', 'git checkout -b feature', 'git switch x', 'git switch -c feature', 'git switch -']);
});

test('reset --hard and clean -f are denied, their safe forms are not', async () => {
  await assertDenied(['git reset --hard', 'git reset HEAD~1 --hard', 'git -C repo reset --hard origin/main', 'git reset "--hard"'], /reset --hard/);
  await assertDenied(['git clean -f', 'git clean -fd', 'git clean -xdf', 'git clean --force'], /clean -f/);
  await assertAllowed(['git reset --soft HEAD~1', 'git reset HEAD file.txt', 'git clean -n', 'git clean -nd']);
});

test('a git invoked by path or after an environment assignment is checked', async () => {
  await assertDenied([
    '/usr/bin/git reset --hard',
    './git reset --hard',
    'GIT_DIR=.git git reset --hard',
    'ls .git; git reset --hard'
  ], /reset --hard/);
  await assertAllowed(['ls .git', 'GIT_DIR=.git git status']);
});

test('dropping or clearing a stash is denied, saving and popping are not', async () => {
  await assertDenied(['git stash drop', 'git stash drop stash@{1}', 'git stash clear', 'make; git stash clear'], /stash/);
  await assertAllowed(['git stash list', 'git stash pop', 'git stash push -m "wip"']);
});

test('checking out or restoring the whole tree is denied, naming files or unstaging is not', async () => {
  await assertDenied([
    'git checkout .',
    'git checkout -- .',
    'git checkout -- "."',
    "git restore '.'",
    'git restore .',
    'git restore --worktree .',
    'git restore --staged --worktree .',
    'git checkout HEAD .',
    'git restore *',
    'git checkout -- *'
  ], /whole tree/);
  await assertAllowed([
    'git restore --staged .',
    'git restore -S .',
    'git restore --staged *',
    'git checkout file.txt',
    'git checkout -b feature',
    'git restore src/app.js'
  ]);
});

test('words in a commit message, a quoted string or a heredoc are not commands', async () => {
  await assertAllowed([
    'git commit -m "explain why git push --force is denied"',
    "git commit -m 'never run git reset --hard'",
    'git commit -m fix-git-clean-f-docs',
    'echo "git stash drop"',
    'git commit -F - <<EOF\ngit reset --hard\ngit checkout .\nEOF',
    'git push origin main && echo -f'
  ]);
  assert.match(await reason('git commit -m "x" && git reset --hard'), /reset --hard/);
});

test('force-deleting a branch with no name or with unlanded commits is denied', async () => {
  const root = await repository();
  git(root, 'switch', '-q', '-c', 'feature');
  await commitFiles(root, { 'feature.txt': 'feature\n' }, 'add the feature');
  git(root, 'switch', '-q', 'main');
  const denied = await reason(`git -C ${root} branch -D feature`);
  assert.match(denied, /force-deleting feature discards commits not in main yet: [0-9a-f]{7} add the feature/);
  assert.match(await reason(`git -C ${root} branch --delete --force feature`), /not in main yet/);
  assert.match(await reason(`git -C ${root} branch --force --delete feature`), /not in main yet/);
  assert.match(await reason(`git -C ${root} branch -fd feature`), /not in main yet/);
  assert.match(await reason(`git -C ${root} branch -D "feature"`), /not in main yet/);
  assert.match(await reason(`git -C ${root} branch -D`), /force-deleting a branch discards unmerged work/);
  assert.match(await reason(`git -C ${root} branch -D nope`), /no branch named nope here/);
  assert.match(await reason(`git -C ${root} branch -D $(echo feature)`), /no branch named \$\(echo here/);
});

test('force-deleting a branch is allowed when its commits are in main or its pull request is merged', async () => {
  const root = await repository();
  git(root, 'branch', 'idle');
  git(root, 'switch', '-q', '-c', 'rebased');
  await commitFiles(root, { 'rebased.txt': 'rebased\n' }, 'add rebased');
  git(root, 'switch', '-q', 'main');
  git(root, 'cherry-pick', 'rebased');
  git(root, 'switch', '-q', '-c', 'squashed');
  await commitFiles(root, { 'squashed.txt': 'squashed\n' }, 'add squashed');
  git(root, 'switch', '-q', 'main');
  await assertAllowed([
    `git -C ${root} branch -D idle`,
    `git -C ${root} branch -D rebased`,
    `git -C ${root} branch -d idle`,
    `git -C ${root} branch`,
    `git -C ${root} branch --list`,
    `git -C ${root} branch new-branch`
  ]);
  assert.match(await reason(`git -C ${root} branch -D squashed`), /not in main yet/);
  assert.equal(await reason(`git -C ${root} branch -D squashed`, { ghState: 'MERGED' }), null);
  assert.match(await reason(`git -C ${root} branch -D squashed`, { ghState: 'OPEN' }), /not in main yet/);
});

test('force-deleting a branch whose content landed as a squash commit is allowed, an extra or conflicting change is not', async () => {
  const root = await repository();
  for (const branch of ['landed', 'extra', 'conflicting']) {
    git(root, 'switch', '-q', '-c', branch, 'main');
    await commitFiles(root, { [`${branch}.txt`]: 'one\n' }, `add ${branch}`);
    await commitFiles(root, { [`${branch}.txt`]: 'two\n' }, `change ${branch}`);
  }
  git(root, 'switch', '-q', 'main');
  for (const branch of ['landed', 'extra', 'conflicting']) {
    git(root, 'merge', '-q', '--squash', branch);
    git(root, 'commit', '-q', '-m', `squash ${branch}`);
  }
  await commitFiles(root, { 'conflicting.txt': 'main\n' }, 'change conflicting on main');
  git(root, 'switch', '-q', 'extra');
  await commitFiles(root, { 'extra.txt': 'three\n' }, 'change extra again');
  git(root, 'switch', '-q', 'main');
  await assertAllowed([`git -C ${root} branch -D landed`]);
  assert.match(await reason(`git -C ${root} branch -D extra`), /force-deleting extra discards commits not in main yet/);
  assert.match(await reason(`git -C ${root} branch -D conflicting`), /force-deleting conflicting discards commits not in main yet/);
});

test('a missing branch is denied by name without asking gh, and an unresolved base still asks gh', async () => {
  const root = await repository();
  assert.match(await reason(`git -C ${root} branch -D nope`, { ghState: 'MERGED' }), /no branch named nope here/);
  git(root, 'branch', '-m', 'main', 'master');
  git(root, 'switch', '-q', '-c', 'feature');
  await commitFiles(root, { 'feature.txt': 'feature\n' }, 'add the feature');
  git(root, 'switch', '-q', 'master');
  assert.match(await reason(`git -C ${root} branch -D feature`), /only a branch whose commits are all in/);
  assert.equal(await reason(`git -C ${root} branch -D feature`, { ghState: 'MERGED' }), null);
});

test('every branch of a chained or multiple delete is checked', async () => {
  const root = await repository();
  git(root, 'branch', 'idle');
  git(root, 'switch', '-q', '-c', 'feature');
  await commitFiles(root, { 'feature.txt': 'feature\n' }, 'add the feature');
  git(root, 'switch', '-q', 'main');
  assert.match(await reason(`git -C ${root} branch -D idle feature`), /force-deleting feature/);
  assert.match(await reason(`git -C ${root} branch -D feature && git -C ${root} branch -D idle`), /force-deleting feature/);
  assert.match(await reason(`git -C ${root} branch -D idle && git -C ${root} branch -D feature`), /force-deleting feature/);
  assert.equal(await reason(`git -C ${root} branch -D idle && echo done`), null);
});

test('other tools and empty input pass', async () => {
  const edit = await guard({ tool_name: 'Edit', tool_input: { command: 'git reset --hard' } });
  assert.deepEqual([edit.code, edit.stdout], [0, '']);
  assert.equal(await reason(''), null);
  const empty = await guard(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
});

test('the guards setting off stands the guard down', async () => {
  const command = 'git reset --hard';
  assert.match(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } }), /git-guard/);
  assert.equal(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('an unreadable settings file leaves the guard on', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), '{ broken');
  const outcome = await run(GUARD, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
  assert.match(outcome.stdout, /git-guard/);
});

test('input that is not JSON exits 0 with no output', async () => {
  const broken = await guard(null, { input: '{ not json' });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});

test('a git invocation spelled with a tab, a continuation, quotes, .exe or a path is denied', async () => {
  await assertDenied([
    'git\treset --hard',
    'git reset\t--hard',
    'git reset \\\n --hard',
    'git \\\nreset --hard',
    '"git" reset --hard',
    "'git' reset --hard",
    'git.exe reset --hard',
    '/usr/bin/git reset --hard',
    '`git reset --hard`'
  ], /reset --hard/);
});

test('global options with a separate value do not hide the subcommand', async () => {
  await assertDenied([
    'git --git-dir x push --force origin main',
    'git --work-tree x --git-dir y reset --hard',
    'git --namespace n push -f',
    'git --git-dir=x reset --hard'
  ], /force push|reset --hard/);
  await assertAllowed([
    'git --git-dir x push --force-with-lease',
    'git --git-dir x status'
  ]);
});
