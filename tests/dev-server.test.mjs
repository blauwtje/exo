import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ensureDevServer, stopDevServer, readRecord, devServerUrl } from '../lib/dev-server.mjs';

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const serverCommand = (port) => `node -e "require('net').createServer().listen(${port},'127.0.0.1')"`;

test('starts once, reuses the record, and stops it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-'));
  const stateFile = path.join(dir, 'state.json');
  const port = await freePort();
  const command = serverCommand(port);
  const first = await ensureDevServer({ stateFile, command, port, cwd: dir });
  const second = await ensureDevServer({ stateFile, command, port, cwd: dir });
  assert.equal(second.pid, first.pid);
  assert.deepEqual(readRecord(stateFile), { pid: first.pid, port, command });
  assert.equal(devServerUrl(stateFile, '/x'), `http://127.0.0.1:${port}/x`);
  assert.equal(stopDevServer(stateFile), true);
  assert.equal(readRecord(stateFile), null);
  assert.equal(devServerUrl(stateFile, '/x'), null);
});

test('stopping with no record does nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-'));
  assert.equal(stopDevServer(path.join(dir, 'state.json')), false);
});

test('a record whose pid belongs to a process this user cannot signal is not reused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-'));
  const stateFile = path.join(dir, 'state.json');
  const port = await freePort();
  const command = serverCommand(port);
  fs.writeFileSync(stateFile, JSON.stringify({ devServer: { pid: 1, port, command } }));
  const record = await ensureDevServer({ stateFile, command, port, cwd: dir });
  assert.notEqual(record.pid, 1);
  stopDevServer(stateFile);
});
