import { execFile } from 'node:child_process';
import process from 'node:process';
import { environmentDelayMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { failureLine, gateRequest, isRetryable } from './request-gate.mjs';
import { resolveYtDlp } from './ytdlp-binary.mjs';

export const YTDLP_INSTALL = "'brew install yt-dlp' or 'pipx install yt-dlp'";

const JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`];
const UNKNOWN_RUNTIME_OPTION = /no such option: --js-runtimes|unrecognized arguments:.*--js-runtimes/;

function execute(command, args, timeout) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function runYtDlp(args, timeout) {
  const { command } = resolveYtDlp();
  return execute(command ?? 'yt-dlp', args, timeout);
}

async function runWithRuntime(args, timeout) {
  const run = await runYtDlp([...JS_RUNTIME, ...args], timeout);
  if (!run.error || !UNKNOWN_RUNTIME_OPTION.test(run.stderr)) return run;
  return runYtDlp(args, timeout);
}

const SEARCH_QUERY = /^ytsearch(?:date)?\d+:/;
const YOUTUBE_SEARCH_URL = 'https://www.youtube.com/results';

function urlOf(args) {
  if (args.some((arg) => SEARCH_QUERY.test(arg))) return YOUTUBE_SEARCH_URL;
  const marker = args.indexOf('--');
  return marker === -1 ? args.find((arg) => /^https?:\/\//.test(arg)) : args[marker + 1];
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffAfter(attempt) {
  return environmentDelayMs('EXO_WATCH_BACKOFF_MS', DEFAULTS.retryBackoffMs) * 2 ** (attempt - 1);
}

export async function runYtDlpWithRuntime(args, timeout) {
  const url = urlOf(args);
  for (let attempt = 1; ; attempt += 1) {
    await gateRequest(url);
    const run = await runWithRuntime(args, timeout);
    if (!isRetryable(run) || attempt >= DEFAULTS.retryTries) return run;
    await pause(backoffAfter(attempt));
  }
}

export function ytDlpReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.ytDlpMs / 1000} s`;
  return failureLine(run);
}

export async function ytDlpAvailable(timeout) {
  const { command } = resolveYtDlp();
  if (!command) return false;
  const { error } = await execute(command, ['--version'], timeout);
  return !(error && error.code === 'ENOENT');
}

export async function ytDlpNeed() {
  const { command } = resolveYtDlp();
  if (command) return null;
  return `yt-dlp on PATH; install it with ${YTDLP_INSTALL}`;
}
