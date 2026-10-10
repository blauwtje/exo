// Kills a command and every process it started. Off Windows the command leads its
// own process group, so one signal to the negative pid reaches the whole tree;
// Windows has no groups, so `taskkill /T` walks the tree. Imported as `#process-tree`.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

/** Kills `pid` and its descendants; `platform` and `run` (a spawnSync stand-in) are injectable for tests. */
export function killTree(pid, { platform = process.platform, run = spawnSync } = {}) {
  if (platform === 'win32') {
    run('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
}

/**
 * Runs `command` under `bash -e -c` and waits, stopping it and its whole tree at `timeoutMs`.
 * Synchronous: the module runs itself as a child (below) that owns the timer and reports one
 * JSON line on stderr. The command is one argv element, never re-quoted.
 */
export function runTreeSync(command, { cwd, timeoutMs }) {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), command, String(timeoutMs)], {
    cwd, encoding: 'utf8', timeout: timeoutMs + 10_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
  });
  const output = run.stdout ?? '';
  if (run.error !== undefined) {
    return { status: null, signal: run.signal ?? null, output, timedOut: run.error.code === 'ETIMEDOUT', error: run.error };
  }
  const line = (run.stderr ?? '').trim().split('\n').pop();
  try {
    const report = JSON.parse(line);
    return { status: report.status, signal: report.signal, output, timedOut: report.timedOut, error: undefined };
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
  const finish = (status, signal, error) => {
    clearTimeout(timer);
    process.stdout.write(Buffer.concat(chunks).toString('utf8') + (error ? `${error.message}\n` : ''));
    process.stderr.write(`${JSON.stringify({ status, signal, timedOut })}\n`);
  };
  child.on('error', (error) => finish(null, null, error));
  child.on('close', (status, signal) => finish(status, signal));
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runChild(process.argv[2], Number(process.argv[3]));
}
