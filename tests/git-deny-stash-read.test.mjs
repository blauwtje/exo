import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedStateSubcommand } from '../lib/git-deny.mjs';

const allowed = ['git stash list', 'git stash show', 'git stash show -p stash@{1}', 'git stash list --oneline', 'cd x && git stash list', 'git -C dir stash list | head', 'bash -c "git stash show"'];
const refused = ['git stash', 'git stash save', 'git stash push', 'git stash pop', 'git stash apply', 'git stash drop', 'git stash clear', 'git stash -m list', 'git stash -u', 'git stash -- list', 'git stash list && git stash pop', 'git stash show; git stash drop', 'git stash list; git stash', 'bash -c "git stash list; git stash pop"', 'git stash create', 'git stash store x'];

test('read-only stash subcommands are allowed', () => {
  for (const command of allowed) assert.equal(sharedStateSubcommand(command), undefined, command);
});

test('every mutating stash form is still refused', () => {
  for (const command of refused) assert.equal(sharedStateSubcommand(command), 'stash', command);
});

test('a stash write inside a data heredoc is not denied, inside a shell heredoc it is', async () => {
  const { sharedStateSubcommand } = await import('../lib/git-deny.mjs');
  assert.equal(sharedStateSubcommand("python3 <<'EOF'\ngit stash\nEOF"), undefined);
  assert.equal(sharedStateSubcommand("zsh <<'EOF'\ngit stash\nEOF"), 'stash');
});
