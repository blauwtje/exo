import { spawn } from 'node:child_process';
import process from 'node:process';
import { environmentMs, isMain } from './script-flags.mjs';

export const STALL_EXIT = 124;

export const stallSeconds = () => environmentMs('EXO_STALL_MS', 60_000) / 1000;

export function stallMessage(seconds) {
  return `exo: no output for ${seconds} s, stopped. Rerun with output streaming, e.g. 2>&1 | tee <log>, and read the first error line.`;
}

function commandOf(argv) {
  const split = argv.indexOf('--');
  return split === -1 ? '' : argv.slice(split + 1).join(' ');
}

export function runGuarded({ command, seconds }) {
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
      }, seconds * 1000);
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
  const seconds = stallSeconds();
  const code = await runGuarded({ command: commandOf(process.argv.slice(2)), seconds });
  if (code === STALL_EXIT) process.stderr.write(`${stallMessage(seconds)}\n`);
  process.exit(code);
}
