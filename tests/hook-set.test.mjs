import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHookSet } from '../verify/checks/hook-set.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const command = { hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs"', timeout: 5 }] };

function run(hooks) {
  return checkOutcome(checkHookSet, createRepository(tree({ 'hooks/hooks.json': JSON.stringify({ hooks }), 'hook.mjs': '' })));
}

test('the two shipped hooks pass', () => {
  const result = run({ SessionStart: [command], UserPromptSubmit: [command] });
  assert.equal(result.ok, true, result.detail);
});

test('a third event fails', () => {
  const result = run({ SessionStart: [command], UserPromptSubmit: [command], Stop: [command] });
  assert.match(result.detail, /event Stop is not shipped/);
});

test('a second hook under one event fails', () => {
  const result = run({ SessionStart: [{ hooks: [command.hooks[0], command.hooks[0]] }], UserPromptSubmit: [command] });
  assert.match(result.detail, /event SessionStart must hold one entry with one command hook/);
});

test('a null entry fails with a message instead of throwing', () => {
  const result = run({ SessionStart: [null], UserPromptSubmit: [command] });
  assert.equal(result.ok, false);
  assert.match(result.detail, /event SessionStart must hold one entry with one command hook/);
});

test('a command naming a misspelled script fails', () => {
  const typo = { hooks: [{ ...command.hooks[0], command: 'node "${CLAUDE_PLUGIN_ROOT}/hok.mjs"' }] };
  const result = run({ SessionStart: [typo], UserPromptSubmit: [command] });
  assert.match(result.detail, /event SessionStart command names missing file hok\.mjs/);
});

test('a non-numeric timeout fails', () => {
  const slow = { hooks: [{ ...command.hooks[0], timeout: '5' }] };
  const result = run({ SessionStart: [command], UserPromptSubmit: [slow] });
  assert.match(result.detail, /event UserPromptSubmit timeout is not a number/);
});

test('a missing hooks.json fails with a message', () => {
  const result = checkOutcome(checkHookSet, createRepository(tree({ 'a.txt': '' })));
  assert.match(result.detail, /hooks\/hooks\.json cannot be read/);
});

test('the shipped hooks.json passes', () => {
  const result = checkOutcome(checkHookSet, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});
