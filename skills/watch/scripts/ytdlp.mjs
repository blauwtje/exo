import { execFile } from 'node:child_process';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { resolveYtDlp } from './ytdlp-binary.mjs';

export const YTDLP_INSTALL = "'brew install yt-dlp' or 'pipx install yt-dlp'";

const JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`];
const UNKNOWN_RUNTIME_OPTION = /no such option: --js-runtimes|unrecognized arguments:.*--js-runtimes/;

function resolution() {
  return resolveYtDlp({ fetchMs: environmentMs('EXO_WATCH_FETCH_MS', DEFAULTS.fetchMs) });
}

function execute(command, args, timeout) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function runYtDlp(args, timeout) {
  const { command } = await resolution();
  return execute(command ?? 'yt-dlp', args, timeout);
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
  const { command } = await resolution();
  if (!command) return false;
  const { error } = await execute(command, ['--version'], timeout);
  return !(error && error.code === 'ENOENT');
}

export async function ytDlpNeed() {
  const { command, reason } = await resolution();
  if (command) return null;
  const note = reason ? ` (fetching the release binary failed: ${reason})` : '';
  return `yt-dlp on PATH${note}; install it with ${YTDLP_INSTALL}`;
}
