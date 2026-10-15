import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankCommandText } from '../hooks/guards/command-text.mjs';
import { denialFor as destructiveDenial } from '../hooks/guards/destructive-guard.mjs';
import { innerCommands } from '../hooks/guards/inner-commands.mjs';

test('command text: quoted text and heredoc bodies blank, keeping every position', () => {
  const command = `echo "git reset --hard"`;
  const blanked = blankCommandText(command);
  assert.equal(blanked.length, command.length);
  assert.doesNotMatch(blanked, /reset/);
});

test('command text: a substitution in double quotes runs, so it is kept', () => {
  assert.match(blankCommandText(`echo "$(git reset --hard)"`), /git reset --hard/);
});

test('command text: a quoted git counts only at the start of a command', () => {
  assert.match(blankCommandText(`"git" status`), /git/);
  assert.doesNotMatch(blankCommandText(`echo "git" status`), /git/);
});

test('destructive guard: stopping, image removal and plain compose down stay allowed', () => {
  assert.equal(destructiveDenial('docker stop web'), null);
  assert.equal(destructiveDenial('docker rmi image'), null);
  assert.equal(destructiveDenial('docker compose down'), null);
  assert.ok(destructiveDenial('docker rm web'));
});

test('destructive guard: SQL counts only in a pipeline that runs a database client', () => {
  assert.equal(destructiveDenial('echo "DROP TABLE users"'), null);
  assert.ok(destructiveDenial('echo "DROP TABLE users" | psql'));
});

test('inner commands: only a call at a command start counts', () => {
  assert.deepEqual(innerCommands('bash -c "git status"'), ['git status']);
  assert.deepEqual(innerCommands('sudo bash -c "git reset --hard"'), []);
});

test('inner commands: eval reads its first argument only', () => {
  assert.deepEqual(innerCommands('eval "one" "two"'), ['one']);
});

test('inner commands: a double-quoted string resolves its escapes', () => {
  assert.deepEqual(innerCommands('bash -c "echo \\"hi\\""'), ['echo "hi"']);
});
