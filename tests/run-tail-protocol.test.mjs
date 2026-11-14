import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { runTail } from '../skills/build/scripts/run-tail.mjs';

const answer = (stdout, status) => ({ status, stdout, stderr: '' });

test('the tail runs verify once with the plan and root', () => {
  const calls = [];
  const exec = (script, args, cwd) => {
    calls.push({ script: path.basename(script), args, cwd });
    return answer('PASS Task 1\n', 0);
  };
  const result = runTail({ planPath: '/p/plan.md', root: '/p', exec });
  assert.deepEqual(calls, [{ script: 'verify.mjs', args: ['--plan', '/p/plan.md', '--root', '/p'], cwd: '/p' }]);
  assert.equal(result.gate.status, 0);
  assert.equal(result.stop, undefined);
});

test('a FAIL from verify comes back as the failing gate for the run to stop on', () => {
  const exec = () => answer('FAIL Task 2\n', 1);
  const { gate } = runTail({ planPath: '/p/plan.md', root: '/p', exec });
  assert.equal(gate.status, 1);
  assert.match(gate.stdout, /^FAIL Task 2/m);
});
