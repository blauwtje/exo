import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

function killAlone(pid) {
  try { process.kill(pid, 'SIGKILL'); } catch { }
}

export function killTree(pid, { platform = process.platform, run = spawnSync } = {}) {
  // why: Windows has no process groups, so `taskkill /T` walks the tree; elsewhere one signal to the negative pid reaches the group.
  if (platform === 'win32') {
    const result = run('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    if (result.error !== undefined || result.status !== 0) killAlone(pid);
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { killAlone(pid); }
}

export function startDetached(command, { cwd, env = process.env, log = null }) {
  // why: its own process group lets `killTree` take the shell and everything it started.
  const fd = log === null ? null : openSync(log, 'a');
  const child = spawn('bash', ['-c', command], { cwd, env, detached: process.platform !== 'win32', stdio: fd === null ? 'ignore' : ['ignore', fd, fd] });
  if (fd !== null) closeSync(fd);
  let exited = false;
  child.on('error', () => { exited = true; });
  child.on('exit', () => { exited = true; });
  child.unref();
  return { pid: child.pid, exited: () => exited };
}

export async function waitForUrl(url, { deadlineMs, intervalMs = 1000, app = null }) {
  const end = Date.now() + deadlineMs;
  for (;;) {
    if (app?.exited()) return false;
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch { }
    if (Date.now() + intervalMs > end) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export const RUN_VARIABLES = ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_RUN_SESSION', 'EXO_DROPS'];

export function withoutRunVariables(env = process.env) {
  const kept = { ...env };
  for (const name of RUN_VARIABLES) delete kept[name];
  return kept;
}

export function runTreeSync(command, { cwd, timeoutMs, env = process.env }) {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), command, String(timeoutMs)], {
    cwd, env, encoding: 'utf8', timeout: timeoutMs + 10_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
  });
  const output = run.stdout ?? '';
  if (run.error !== undefined) {
    return { status: null, signal: run.signal ?? null, output, timedOut: run.error.code === 'ETIMEDOUT', error: run.error };
  }
  const line = (run.stderr ?? '').trim().split('\n').pop();
  try {
    const report = JSON.parse(line);
    return { status: report.status, signal: report.signal, output, timedOut: report.timedOut, error: report.error === undefined ? undefined : new Error(report.error) };
  } catch {
    return { status: run.status, signal: run.signal, output, timedOut: false, error: new Error(`no report from process-tree child: ${line}`) };
  }
}

function runChild(command, timeoutMs) {
  const child = spawn('bash', ['-e', '-c', command], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => chunks.push(chunk));
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
  let finished = false;
  const finish = (status, signal, error) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    process.stdout.write(Buffer.concat(chunks).toString('utf8') + (error ? `${error.message}\n` : ''));
    process.stderr.write(`${JSON.stringify({ status, signal, timedOut, error: error?.message })}\n`);
  };
  child.on('error', (error) => finish(null, null, error));
  child.on('close', (status, signal) => finish(status, signal));
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runChild(process.argv[2], Number(process.argv[3]));
}
