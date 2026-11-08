import { spawn } from 'node:child_process';

function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export function captureChild({ command, args, cwd, env, timeoutMs, killSignal = 'SIGKILL' }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child, killSignal);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, signal, timedOut });
    });
  });
}
