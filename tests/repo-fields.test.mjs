import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '../skills/ship/scripts/repo-fields.mjs');

function runFields(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('repo-fields --size prints one JSON line with size, estimate and priority', () => {
  const ran = runFields(['--size', '--paths', '2', '--criteria', '5', '--shape', 'spec']);
  assert.equal(ran.status, 0);
  assert.deepEqual(JSON.parse(ran.stdout), { size: 'M', estimate: 3, priority: 'P2' });
});

test('repo-fields --size takes the highest option for a shipped report', () => {
  const ran = runFields(['--size', '--paths', '1', '--criteria', '1', '--shape', 'report', '--shipped', '--options', 'Urgent,High,Low']);
  assert.deepEqual(JSON.parse(ran.stdout), { size: 'XS', estimate: 1, priority: 'Urgent' });
});

test('repo-fields --size refuses a bad shape with exit 2 and no stdout', () => {
  const ran = runFields(['--size', '--paths', '1', '--criteria', '1', '--shape', 'other']);
  assert.equal(ran.status, 2);
  assert.equal(ran.stdout, '');
  assert.match(ran.stderr, /--shape must be/);
});
