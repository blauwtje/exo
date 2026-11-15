import { execFile } from 'node:child_process';
import { MAX_BUFFER } from '#git';

export class ToolFailure extends Error {}

const FETCH_FAILURE_NAMES = new Set(['TypeError', 'AbortError', 'TimeoutError']);

export function isFetchFailure(error) {
  return FETCH_FAILURE_NAMES.has(error.name);
}

export function runTool(command, args, timeout) {
  const shell = command.endsWith('.cmd');
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout, shell }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

export function toolReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.transcribeMs / 1000} s`;
  const lastLine = run.stderr.trim().split('\n').pop();
  return lastLine || run.error.message;
}
