// currentHost() names the host that runs exo: EXO_HOST wins, then CLAUDECODE=1,
// then any CODEX_ variable, and an undetected host counts as Claude Code.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentHost } from '#host';

test('EXO_HOST=codex beside CLAUDECODE=1 returns codex', () => {
  assert.equal(currentHost({ EXO_HOST: 'codex', CLAUDECODE: '1' }), 'codex');
});

test('EXO_HOST=claude beside a CODEX_ variable returns claude', () => {
  assert.equal(currentHost({ EXO_HOST: 'claude', CODEX_HOME: '/x' }), 'claude');
});

test('CLAUDECODE=1 beside a CODEX_ variable returns claude', () => {
  assert.equal(currentHost({ CLAUDECODE: '1', CODEX_HOME: '/x' }), 'claude');
});

test('a CODEX_ variable alone returns codex', () => {
  assert.equal(currentHost({ CODEX_SANDBOX: 'seatbelt' }), 'codex');
});

test('an empty environment returns claude', () => {
  assert.equal(currentHost({}), 'claude');
});

test('an unknown EXO_HOST falls through to detection', () => {
  assert.equal(currentHost({ EXO_HOST: 'other', CODEX_HOME: '/x' }), 'codex');
  assert.equal(currentHost({ EXO_HOST: 'other' }), 'claude');
});

test('currentHost reads process.env by default', () => {
  assert.ok(['claude', 'codex'].includes(currentHost()));
});
