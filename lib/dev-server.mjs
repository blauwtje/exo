import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';

const READY_TIMEOUT_MS = 30000;
const POLL_MS = 100;

function readState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

export function readRecord(stateFile) {
  return readState(stateFile).devServer ?? null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function accepts(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await accepts(port)) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`dev server did not listen on port ${port} within ${READY_TIMEOUT_MS} ms`);
}

function stopProcess(pid) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return;
  }
}

export async function ensureDevServer({ stateFile, command, port, cwd }) {
  const existing = readRecord(stateFile);
  if (existing && existing.command === command && existing.port === port && isAlive(existing.pid)) return existing;
  const child = spawn(command, { cwd, shell: true, detached: true, stdio: 'ignore' });
  child.unref();
  try {
    await waitForPort(port);
  } catch (error) {
    stopProcess(child.pid);
    throw error;
  }
  const record = { pid: child.pid, port, command };
  fs.writeFileSync(stateFile, JSON.stringify({ ...readState(stateFile), devServer: record }));
  return record;
}

export function stopDevServer(stateFile) {
  const record = readRecord(stateFile);
  if (!record) return false;
  stopProcess(record.pid);
  const { devServer, ...rest } = readState(stateFile);
  fs.writeFileSync(stateFile, JSON.stringify(rest));
  return true;
}

export function devServerUrl(stateFile, route) {
  const record = readRecord(stateFile);
  if (!record) return null;
  return `http://127.0.0.1:${record.port}${route}`;
}
