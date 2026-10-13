import { spawn } from 'node:child_process';
import process from 'node:process';
import { isMain } from './script-flags.mjs';

export const STALL_EXIT = 124;
const DEFAULT_IDLE_SECONDS = 60;

export function idleSeconds(flag, env = process.env) {
  for (const raw of [flag, env.EXO_STALL_SECONDS]) {
    const value = Number(raw);
    if (raw !== undefined && raw !== '' && value > 0) return value;
  }
  return DEFAULT_IDLE_SECONDS;
}

export function stallMessage(seconds) {
  return `exo: no output for ${seconds} s, stopped. Rerun with output streaming, e.g. 2>&1 | tee <log>, and read the first error line.`;
}

export function parseArgs(argv) {
  const split = argv.indexOf('--');
  const head = split === -1 ? argv : argv.slice(0, split);
  const command = split === -1 ? '' : argv.slice(split + 1).join(' ');
  const at = head.indexOf('--idle');
  return { idle: at === -1 ? undefined : head[at + 1], command };
}

export function runGuarded({ command, idle }) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { detached: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let timer;
    let stalled = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, idle * 1000);
    };
    const forward = (target) => (chunk) => {
      arm();
      target.write(chunk);
    };
    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (stalled) resolve(STALL_EXIT);
      else resolve(code ?? (signal ? 128 : 1));
    });
    arm();
  });
}

if (isMain(import.meta.url)) {
  const { idle, command } = parseArgs(process.argv.slice(2));
  const seconds = idleSeconds(idle);
  const code = await runGuarded({ command, idle: seconds });
  if (code === STALL_EXIT) process.stderr.write(`${stallMessage(seconds)}\n`);
  process.exit(code);
}
