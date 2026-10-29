import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../src/cli.mjs';

const tasks = [
  { id: 1, status: 'open', title: 'write docs' },
  { id: 2, status: 'done', title: 'fix login' },
  { id: 3, status: 'open', title: 'ship release' },
];

test('list prints every task', () => {
  assert.equal(run(['list'], tasks).split('\n').length, 3);
});

test('list --status filters', () => {
  assert.equal(run(['list', '--status', 'done'], tasks), '2\tdone\tfix login');
});

test('unknown command throws', () => {
  assert.throws(() => run(['purge'], tasks), /unknown command: purge/);
});
