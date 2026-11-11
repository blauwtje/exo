import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harnessNames } from '../harnesses/capabilities.mjs';
import { ROLES, contractRow, readContract } from '../harnesses/coordination-contract.mjs';

const FIELDS = ['contextBudget', 'maxDepth', 'mayDispatch', 'return', 'wait'];

test('every harness has a row for every role with the contract fields', () => {
  const contract = readContract();
  assert.deepEqual(Object.keys(contract).sort(), harnessNames().sort());
  for (const rows of Object.values(contract)) {
    assert.deepEqual(Object.keys(rows).sort(), [...ROLES].sort());
    for (const row of Object.values(rows)) {
      assert.deepEqual(Object.keys(row).sort(), FIELDS);
    }
  }
});

test('no role goes deeper than two layers below main', () => {
  for (const rows of Object.values(readContract())) {
    for (const row of Object.values(rows)) {
      assert.ok(row.maxDepth <= 2);
    }
  }
});

test('a worker dispatches nothing and a forked coordinator waits in the foreground', () => {
  assert.equal(contractRow('claude', 'worker').mayDispatch, false);
  assert.equal(contractRow('claude', 'fork-coordinator').wait, 'foreground');
  assert.equal(contractRow('claude', 'run-session').wait, 'foreground');
  assert.equal(contractRow('claude', 'main').wait, 'foreground');
  assert.equal(contractRow('claude', 'subagent-coordinator').wait, 'none');
});

test('a return is a verdict line plus a result path', () => {
  const row = contractRow('claude', 'worker');
  assert.equal(row.return.verdictLine, true);
  assert.equal(row.return.resultPath, true);
});

test('an unknown harness or role throws', () => {
  assert.throws(() => contractRow('nope', 'worker'));
  assert.throws(() => contractRow('claude', 'nope'));
});
