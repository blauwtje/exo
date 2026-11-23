import { execFile } from 'node:child_process';
import process from 'node:process';
import { environmentMs } from '#script-flags';

export const RATE_LIMITED_EXIT = 75;
export const INSTALL = "'brew install yt-dlp' or 'pipx install yt-dlp'";
const RATE_LIMIT = /HTTP Error 429|Too Many Requests|rate.?limit|confirm you.{1,6}not a bot/i;
const MAX_BUFFER = 256 * 1024 * 1024;
export const YTDLP_MS = environmentMs('EXO_WATCH_YTDLP_MS', 120000);

export function run(command, args, timeout = YTDLP_MS) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  });
}

export function ytdlp(args, timeout) {
  return run(process.env.EXO_YTDLP ?? 'yt-dlp', ['--no-warnings', ...args], timeout);
}

export async function ytdlpMissing() {
  const result = await ytdlp(['--version'], 15000);
  return result.error?.code === 'ENOENT';
}

export function isRateLimited(result) {
  return RATE_LIMIT.test(result.stderr ?? '');
}

export function reason(result) {
  if (result.error?.killed) return 'yt-dlp did not finish in time';
  return result.stderr.trim().split('\n').pop() || result.error.message;
}

export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(hours > 0 ? 2 : 1, '0');
  const rest = String(Math.floor(seconds % 60)).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}
