import assert from 'node:assert/strict';
import { test } from 'node:test';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', tool_input: { command }, ...extra };
  const output = await dispatchBash(input, undefined, () => false);
  return output?.hookSpecificOutput;
}

const reasonOf = async (command, extra) => (await decide(command, extra))?.permissionDecisionReason ?? '';
const stash = ['git', 'stash'].join(' ');

test('a stash deny names the patch save and restore forms', async () => {
  const reason = await reasonOf(stash);
  assert.match(reason, /git diff > \.exo\/<name>\.patch/);
  assert.match(reason, /git diff --cached/);
  assert.match(reason, /restore with `git apply`/);
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

test('a sleep note names the no-polling rule', async () => {
  const verdict = await decide('sleep 30', { agent_type: 'exo:task-runner' });
  assert.equal(verdict.permissionDecision, undefined);
  assert.match(verdict.additionalContext, /No sleep polling/);
});

test('a heredoc fed to cat is data, one fed to bash is scanned', async () => {
  assert.equal(await decide("cat <<'EOF'\nsleep 5\nEOF"), undefined);
  assert.match((await decide("bash <<'EOF'\nsleep 5\nEOF"))?.additionalContext, /No sleep polling/);
  assert.match((await decide("cat <<'EOF'\nx\nEOF\nsleep 5"))?.additionalContext, /No sleep polling/);
});
