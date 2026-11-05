import { execFile } from 'node:child_process';
import process from 'node:process';

const JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`];
const UNKNOWN_RUNTIME_OPTION = /no such option: --js-runtimes|unrecognized arguments:.*--js-runtimes/;

function runYtDlp(args, timeout) {
  return new Promise((resolve) => {
    execFile('yt-dlp', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

export async function runYtDlpWithRuntime(args, timeout) {
  const run = await runYtDlp([...JS_RUNTIME, ...args], timeout);
  if (!run.error || !UNKNOWN_RUNTIME_OPTION.test(run.stderr)) return run;
  return runYtDlp(args, timeout);
}

function lastLine(text) {
  return text.trim().split('\n').pop() ?? '';
}

export function ytDlpReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.ytDlpMs / 1000} s`;
  return lastLine(run.stderr) || run.error?.message || 'no error text';
}

export async function ytDlpAvailable(timeout) {
  const { error } = await runYtDlp(['--version'], timeout);
  return !(error && error.code === 'ENOENT');
}
