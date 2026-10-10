import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { killTree } from '#process-tree';

test('on Windows killTree runs taskkill with /T and /F on the pid', () => {
  const calls = [];
  killTree(4242, { platform: 'win32', run: (...args) => calls.push(args) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'taskkill');
  assert.deepEqual(calls[0][1], ['/pid', '4242', '/T', '/F']);
});

test('off Windows killTree kills the whole process group, grandchild included', { skip: process.platform === 'win32' }, async () => {
  const child = spawn('sleep 30 & echo $!; wait', { shell: true, detached: true });
  const grandchild = await new Promise((resolve) => child.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim()))));
  const closed = new Promise((resolve) => child.on('close', resolve));
  killTree(child.pid);
  await closed;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
});
