// The writing guard denies AI attribution in a commit, a pull request text and a
// new branch name, and a commit subject that is not a Conventional Commit; it
// passes Edit and Write, reads only the invocations that run, and stands down
// when the guards setting is off.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/writing-guard.mjs', import.meta.url));

async function guard(hookInput, { env = {}, input = JSON.stringify(hookInput) } = {}) {
  const directory = await fixture();
  return run(GUARD, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, ...env }
  });
}

async function reason(command, options) {
  const outcome = await guard({ tool_name: 'Bash', tool_input: { command }, cwd: options?.cwd }, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
}

test('a conventional commit subject passes', async () => {
  assert.equal(await reason('git commit -m "feat(hooks): add the commit check"'), null);
  assert.equal(await reason('git add . && git commit -m "fix!: drop the flag" && git push'), null);
  assert.equal(await reason('git -C repo -c user.name=x commit --message="docs: explain"'), null);
});

test('a subject without a type is denied and the reason names the types', async () => {
  for (const command of [
    'git commit -m "add the commit check"',
    'git commit -m "Feat: add"',
    'git commit -am "feat:add"',
    'git -C repo commit -m "wip"',
    'git commit -m "" '
  ]) {
    assert.match(await reason(command), /Conventional Commits.*build, chore, ci, docs, feat/, command);
  }
});

test('a commit that names no message passes', async () => {
  assert.equal(await reason('git commit --amend --no-edit'), null);
  assert.equal(await reason('git commit --fixup HEAD~1'), null);
});

test('attribution in a commit message is denied', async () => {
  for (const command of [
    'git commit -m "feat: add x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"',
    'git commit -m "feat: add x" -m "Generated with Claude Code"',
    'git commit -m "feat: add x robot_face"'
  ]) {
    assert.match(await reason(command), /must not attribute the work to an AI/, command);
  }
});

test('a heredoc message is read for its subject and its attribution', async () => {
  const body = (subject, extra = '') => `git commit -m "$(cat <<'EOF'\n${subject}\n\nWhy it changed.${extra}\nEOF\n)"`;
  assert.equal(await reason(body('feat(guards): add the writing guard')), null);
  assert.match(await reason(body('add the writing guard')), /Conventional Commits/);
  assert.match(await reason(body('feat: add', '\n\nCo-Authored-By: Claude')), /must not attribute/);
  assert.equal(await reason("git commit -F - <<'EOF'\nfix: repair the parser\nEOF"), null);
  assert.match(await reason("git commit -F - <<'EOF'\nrepair the parser\nEOF"), /Conventional Commits/);
});

test('a message the guard cannot read is denied without quoting it', async () => {
  for (const command of ['git commit -m "$MESSAGE"', 'git commit -F -', 'git commit -F missing-message.txt']) {
    assert.match(await reason(command), /cannot be read before the command runs/, command);
  }
});

test('a message file is read for its subject and its attribution', async () => {
  const directory = await fixture();
  const good = path.join(directory, 'good.txt');
  const bad = path.join(directory, 'bad.txt');
  const attributed = path.join(directory, 'attributed.txt');
  await fs.writeFile(good, 'fix(parser): repair the loop\n\nBody.\n');
  await fs.writeFile(bad, 'repair the loop\n');
  await fs.writeFile(attributed, 'fix: repair the loop\n\nGenerated with Claude Code\n');
  assert.equal(await reason(`git commit -F ${good}`), null);
  assert.match(await reason(`git commit -F ${bad}`), /Conventional Commits/);
  assert.match(await reason(`git commit -F ${attributed}`), /must not attribute/);
  assert.equal(await reason('git commit -F good.txt', { cwd: directory }), null);
});

test('a commit named inside quoted text or a heredoc body does not run', async () => {
  assert.equal(await reason('echo "git commit -m wip"'), null);
  assert.equal(await reason("cat <<'EOF'\ngit commit -m wip\nEOF"), null);
  assert.equal(await reason('git commit -m "docs: explain git checkout -b claude/topic"'), null);
});

test('a pull request text with attribution is denied', async () => {
  assert.match(await reason('gh pr create --title "fix: x" --body "Generated with Claude Code"'), /pull request must not attribute/);
  assert.match(await reason('gh pr comment 4 --body "Co-Authored-By: bot"'), /pull request must not attribute/);
  assert.equal(await reason('gh pr create --title "fix: x" --body "Repairs the loop"'), null);
});

test('a pull request body file is read for attribution', async () => {
  const directory = await fixture();
  const attributed = path.join(directory, 'attributed.md');
  const clean = path.join(directory, 'clean.md');
  await fs.writeFile(attributed, 'Generated with Claude Code');
  await fs.writeFile(clean, 'Repairs the loop');
  assert.match(await reason(`gh pr create --title t --body-file ${attributed}`), /pull request must not attribute/);
  assert.equal(await reason(`gh pr create --title t --body-file ${clean}`), null);
  assert.match(await reason('gh pr create --title t --body-file -'), /cannot be read/);
  assert.match(await reason('gh pr edit 3 --body-file nowhere.md'), /cannot be read/);
});

test('a new branch named for an AI is denied', async () => {
  for (const command of [
    'git checkout -b claude/fix-login',
    'git switch -c codex/topic',
    'git checkout main -b "copilot/topic"',
    'git branch fix/co-authored-by-bot',
    'git branch -m old claude/new',
    'git checkout -b fix/claude-code-run && git push',
    'git checkout -b fix/claude_code-run'
  ]) {
    assert.match(await reason(command), /branch name must not name an AI/, command);
  }
});

test('a branch named for the change passes, and so does leaving a tool-made one', async () => {
  assert.equal(await reason('git checkout -b fix/login-redirect'), null);
  assert.equal(await reason('git switch -c feat/claude-scope'), null);
  assert.equal(await reason('git checkout -b topic claude/start'), null);
  assert.equal(await reason('git branch -m claude/old topic'), null);
  assert.equal(await reason('git checkout claude/existing'), null);
});

test('Edit and Write pass, whatever they carry', async () => {
  const text = `a dash ${String.fromCharCode(0x2014)} and Co-Authored-By: Claude`;
  for (const hookInput of [
    { tool_name: 'Write', tool_input: { file_path: '/tmp/x.mjs', content: text } },
    { tool_name: 'Edit', tool_input: { file_path: '/tmp/x.mjs', new_string: text } }
  ]) {
    const outcome = await guard(hookInput);
    assert.deepEqual([outcome.code, outcome.stdout], [0, '']);
  }
});

test('the guards setting off stands the guard down', async () => {
  const command = 'git commit -m "wip"';
  assert.match(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } }), /Conventional Commits/);
  assert.equal(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('an unreadable settings file leaves the guard on', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), '{ broken');
  const outcome = await run(GUARD, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "wip"' } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
  assert.match(outcome.stdout, /Conventional Commits/);
});

test('empty input passes and input that is not JSON exits 0 with no output', async () => {
  const empty = await guard(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
  const broken = await guard(null, { input: '{ not json' });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});
