// innerCommands lists the string arguments of `bash|sh|zsh -c` and `eval`, and
// guardDecision judges each one with the guard, first denial winning, three
// levels deep.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankCommandText } from '../hooks/guards/command-text.mjs';
import { guardDecision } from '../hooks/dispatch-bash.mjs';
import { innerCommands } from '../hooks/guards/inner-commands.mjs';

test('the argument of bash -c, sh -c, zsh -c and a login -lc is read', () => {
  assert.deepEqual(innerCommands(`bash -c "git status"`), ['git status']);
  assert.deepEqual(innerCommands(`sh -c 'rm -rf x'`), ['rm -rf x']);
  assert.deepEqual(innerCommands(`/bin/zsh -lc "a; b"`), ['a; b']);
});

test('eval reads its quoted or bare first argument', () => {
  assert.deepEqual(innerCommands(`eval "git reset --hard"`), ['git reset --hard']);
  assert.deepEqual(innerCommands(`eval ls`), ['ls']);
});

test('escapes in a double-quoted argument resolve', () => {
  assert.deepEqual(innerCommands('bash -c "echo \\"hi\\" \\$HOME"'), ['echo "hi" $HOME']);
});

test('a call after a separator counts and a mention in a message does not', () => {
  assert.deepEqual(innerCommands(`cd x && bash -c "ls"`), ['ls']);
  assert.deepEqual(innerCommands(`echo "bash -c 'ls'"`), []);
  assert.deepEqual(innerCommands(`git commit -m "run bash -c 'ls'"`), []);
});

test('a command with no wrapper has no inner command', () => {
  assert.deepEqual(innerCommands('git status && ls'), []);
  assert.deepEqual(innerCommands('bash script.sh'), []);
});

const hookInput = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const denyReset = (command) => (/reset --hard/.test(blankCommandText(command)) ? 'no reset' : null);
const reasonOf = (command, denialFor = denyReset) => guardDecision(hookInput(command), denialFor)?.hookSpecificOutput.permissionDecisionReason ?? null;

test('guardDecision denies a command hidden inside bash -c or eval', () => {
  assert.equal(reasonOf('bash -c "git reset --hard"'), 'no reset');
  assert.equal(reasonOf(`eval 'git reset --hard'`), 'no reset');
});

test('guardDecision reaches three levels and stops at the fourth', () => {
  const nest = (command) => `bash -c "${command.replace(/["\\$`]/g, '\\$&')}"`;
  const one = nest('git reset --hard');
  const two = nest(one);
  const three = nest(two);
  const four = nest(three);
  assert.equal(reasonOf(one), 'no reset');
  assert.equal(reasonOf(two), 'no reset');
  assert.equal(reasonOf(three), 'no reset');
  assert.equal(reasonOf(four), null);
});

test('the first denial wins and an outer denial is kept', () => {
  const guard = (command) => (command.includes('outer') ? 'outer reason' : /reset/.test(command) ? 'inner reason' : null);
  assert.equal(reasonOf('bash -c "git reset"; echo outer', guard), 'outer reason');
  assert.equal(reasonOf('bash -c "git reset"', guard), 'inner reason');
});

test('a command that is fine inside and out is allowed', () => {
  assert.equal(guardDecision(hookInput('bash -c "git status"'), denyReset), null);
});
