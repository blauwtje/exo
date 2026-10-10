import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { killTree, runTreeSync } from '#process-tree';

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

test('runTreeSync returns merged output and the exit status', () => {
  const result = runTreeSync('echo out; echo err >&2; exit 3', { cwd: process.cwd(), timeoutMs: 10000 });
  assert.equal(result.status, 3);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /out/);
  assert.match(result.output, /err/);
});

test('runTreeSync runs the command in cwd and passes quotes through untouched', () => {
  const result = runTreeSync(`pwd; echo "a 'b' \\$HOME"`, { cwd: '/tmp', timeoutMs: 10000 });
  assert.equal(result.status, 0);
  assert.match(result.output, /a 'b' \$HOME/);
});

test('runTreeSync stops a command and its background child at the deadline', { skip: process.platform === 'win32' }, async () => {
  const started = Date.now();
  const result = runTreeSync('sleep 30 & echo $!; wait', { cwd: process.cwd(), timeoutMs: 500 });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 10000);
  const grandchild = Number(result.output.trim().split('\n')[0]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
});
