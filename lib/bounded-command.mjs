import { spawn } from 'node:child_process';
import process from 'node:process';
import { killTree } from './process-tree.mjs';

export const KILL_GRACE_MS = 5000;

const supportsProcessGroups = () => process.platform !== 'win32';

function timeoutResult(run) {
  return { ok: false, code: null, signal: null, timedOutMs: run.timeoutMs, output: run.output, ms: Date.now() - run.started };
}

function closeResult(run, code, signal) {
  if (run.expired) return timeoutResult(run);
  return { ok: code === 0, code, signal, output: run.output, ms: Date.now() - run.started };
}

function settle(run, result) {
  if (run.done) return;
  run.done = true;
  run.timers.forEach(clearTimeout);
  run.child.stdout.destroy();
  run.child.stderr.destroy();
  run.resolve(result);
}

function startDeadline(run) {
  return setTimeout(() => {
    killTree(run.child.pid);
    run.expired = true;
    run.timers.push(setTimeout(() => settle(run, timeoutResult(run)), KILL_GRACE_MS));
  }, run.timeoutMs);
}

function watch(run) {
  const append = (chunk) => { run.output += chunk; };
  run.child.stdout.on('data', append);
  run.child.stderr.on('data', append);
  run.child.on('error', (error) => settle(run, { ok: false, code: error.code ?? error.message, signal: null, output: run.output }));
  run.child.on('close', (code, signal) => settle(run, closeResult(run, code, signal)));
}

export function runBounded(command, timeoutMs, env = process.env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { shell: true, env, detached: supportsProcessGroups() });
    const run = { child, resolve, timeoutMs, started, output: '', done: false, expired: false, timers: [] };
    run.timers.push(startDeadline(run));
    watch(run);
  });
}
