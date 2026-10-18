import assert from 'node:assert/strict';
import test from 'node:test';
import { cellEnvironment } from '../benchmarks/sweep-cells.mjs';

test('a sweep run cell started from a Claude Code session drops the session marker exo run refuses on', () => {
  const env = cellEnvironment({ runSession: 'task' }, { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's', PATH: '/bin' }, { EXO_SWEEP_CELL_ROOT: '/cell' });
  assert.equal(env.CLAUDECODE, undefined);
  assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.EXO_SWEEP_CELL_ROOT, '/cell');
});

test('a sweep claude cell keeps the environment its past results were measured in', () => {
  const env = cellEnvironment({}, { CLAUDECODE: '1', PATH: '/bin' }, {});
  assert.equal(env.CLAUDECODE, '1');
});
