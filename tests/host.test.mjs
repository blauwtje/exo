// currentHost() names the host that runs exo: only EXO_HOST decides, and a
// missing or unknown value counts as Claude Code.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentHost } from '#host';

test('EXO_HOST=codex returns codex', () => {
  assert.equal(currentHost({ EXO_HOST: 'codex' }), 'codex');
});

test('EXO_HOST=claude returns claude', () => {
  assert.equal(currentHost({ EXO_HOST: 'claude' }), 'claude');
});

test('EXO_HOST=codex beside CLAUDECODE=1 returns codex', () => {
  assert.equal(currentHost({ EXO_HOST: 'codex', CLAUDECODE: '1' }), 'codex');
});

test('EXO_HOST=claude beside a CODEX_ variable returns claude', () => {
  assert.equal(currentHost({ EXO_HOST: 'claude', CODEX_HOME: '/x' }), 'claude');
});

test('CLAUDECODE=1 alone returns claude', () => {
  assert.equal(currentHost({ CLAUDECODE: '1' }), 'claude');
});

test('a CODEX_ variable alone changes nothing', () => {
  assert.equal(currentHost({ CODEX_HOME: '/x' }), 'claude');
  assert.equal(currentHost({ CODEX_SANDBOX: 'seatbelt' }), 'claude');
});

test('an empty environment returns claude', () => {
  assert.equal(currentHost({}), 'claude');
});

test('an unknown EXO_HOST returns claude', () => {
  assert.equal(currentHost({ EXO_HOST: 'other', CODEX_HOME: '/x' }), 'claude');
  assert.equal(currentHost({ EXO_HOST: 'other' }), 'claude');
});

test('currentHost reads process.env by default', () => {
  assert.ok(['claude', 'codex'].includes(currentHost()));
});
