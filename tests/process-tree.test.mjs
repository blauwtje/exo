import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { killTree, runTreeSync, startDetached, waitForUrl } from '#process-tree';

test('on Windows killTree runs taskkill with /T and /F on the pid', () => {
  const calls = [];
  killTree(4242, { platform: 'win32', run: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'taskkill');
  assert.deepEqual(calls[0][1], ['/pid', '4242', '/T', '/F']);
});

test('on Windows killTree falls back to killing the pid when taskkill fails', { skip: process.platform === 'win32' }, async () => {
  const child = spawn('sleep', ['30']);
  const closed = new Promise((resolve) => child.on('close', resolve));
  killTree(child.pid, { platform: 'win32', run: () => ({ status: 1, error: new Error('ENOENT') }) });
  const outcome = await Promise.race([closed.then(() => 'killed'), new Promise((resolve) => setTimeout(() => resolve('alive'), 2000))]);
  child.kill('SIGKILL');
  assert.equal(outcome, 'killed');
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

test('waitForUrl returns not-ready as soon as the app process exits', { skip: process.platform === 'win32' }, async () => {
  const app = startDetached('exit 1', { cwd: process.cwd() });
  const started = Date.now();
  const ready = await waitForUrl('http://127.0.0.1:1', { deadlineMs: 30_000, app });
  assert.equal(ready, false);
  assert.ok(Date.now() - started < 10_000);
});

test('startDetached writes the output of the command to the log file', { skip: process.platform === 'win32' }, async () => {
  const log = path.join(mkdtempSync(path.join(tmpdir(), 'exo-app-')), 'app.log');
  const app = startDetached('echo from-app; echo oops >&2', { cwd: process.cwd(), log });
  for (let round = 0; round < 50 && !app.exited(); round += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(readFileSync(log, 'utf8'), /from-app\noops\n/);
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
  assert.equal(result.output.split('\n')[0], realpathSync('/tmp'));
  assert.match(result.output, /a 'b' \$HOME/);
});

test('runTreeSync returns an error when bash cannot spawn', () => {
  const path = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    const result = runTreeSync('true', { cwd: process.cwd(), timeoutMs: 5000 });
    assert.ok(result.error instanceof Error);
  } finally {
    process.env.PATH = path;
  }
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
