import { execFile } from 'node:child_process';

export function runTool(command, args, timeout) {
  const shell = command.endsWith('.cmd');
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout, shell }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

export function toolReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.transcribeMs / 1000} s`;
  const lastLine = run.stderr.trim().split('\n').pop();
  return lastLine || run.error.message;
}
