import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
const { scriptBytes } = await import('../lib/context-limits.mjs');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', tool_input: { command }, ...extra };
  const output = await dispatchBash(input, undefined, () => false);
  return output?.hookSpecificOutput;
}

const reasonOf = async (command, extra) => (await decide(command, extra))?.permissionDecisionReason ?? '';
const stash = ['git', 'stash'].join(' ');
const longText = () => 'x'.repeat(scriptBytes() + 10);

test('a stash deny names the patch save and restore forms', async () => {
  const reason = await reasonOf(stash);
  assert.match(reason, /git diff > \.exo\/<name>\.patch/);
  assert.match(reason, /git diff --cached/);
  assert.match(reason, /git apply \.exo\/<name>\.patch/);
});

test('a worktree deny tells the subagent to return BLOCKED naming the worktree', async () => {
  for (const command of ['git worktree remove w', 'git worktree prune', 'git worktree move a b']) {
    assert.match(await reasonOf(command), /return BLOCKED naming the worktree or branch so the lead runs it/, command);
  }
});

test('a branch deny tells the subagent to return BLOCKED naming the branch', async () => {
  for (const command of ['git branch -D run', 'git branch -m old new']) {
    assert.match(await reasonOf(command), /return BLOCKED naming the worktree or branch so the lead runs it/, command);
  }
});

test('a wide find deny names find . and git ls-files', async () => {
  for (const command of ['find / -name x', 'find ~ -name x', 'find $HOME -name x']) {
    const reason = await reasonOf(command, { agent_id: undefined });
    assert.match(reason, /`find \.`/, command);
    assert.match(reason, /`git ls-files`/, command);
  }
});

test('a sleep deny names the notification wait and wait-report.mjs', async () => {
  const reason = await reasonOf('sleep 30', { agent_type: 'exo:task-runner' });
  assert.match(reason, /end your turn and wait for the notification/);
  assert.match(reason, /wait-report\.mjs/);
});

test('a long command is saved verbatim under .exo/ and the deny names the one line that runs it', async () => {
  const cwd = tempDir('exo-long-');
  const command = `echo ${longText()}`;
  const reason = await reasonOf(command, { cwd });
  const hash = createHash('sha256').update(command).digest('hex').slice(0, 12);
  const relative = `.exo/long-command-${hash}.sh`;
  assert.ok(reason.includes(`bash ${relative}`), reason);
  assert.equal(fs.readFileSync(path.join(cwd, relative), 'utf8'), command);
});

test('a long command that also holds a denied form returns that deny and saves nothing', async () => {
  const cwd = tempDir('exo-long-');
  const reason = await reasonOf(`${stash}; echo ${longText()}`, { cwd });
  assert.match(reason, /git apply \.exo\/<name>\.patch/);
  assert.equal(fs.existsSync(path.join(cwd, '.exo')), false);
});

test('a long command from the lead is neither denied nor saved', async () => {
  const cwd = tempDir('exo-long-');
  const output = await decide(`echo ${longText()}`, { cwd, agent_id: undefined });
  assert.notEqual(output?.permissionDecision, 'deny');
  assert.equal(fs.existsSync(path.join(cwd, '.exo')), false);
});
