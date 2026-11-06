import { runYtDlpWithRuntime, ytDlpReason, ytDlpAvailable } from './ytdlp.mjs';
import { formatDuration } from './format.mjs';
import { YOUTUBE_HOST } from './video-url.mjs';

const MISSING = "listing a profile needs yt-dlp on PATH; install it with 'brew install yt-dlp' or 'pipx install yt-dlp', then rerun";

function flattened(entries = []) {
  return entries.flatMap((entry) => {
    if (!entry) return [];
    return entry.entries ? flattened(entry.entries) : [entry];
  });
}

function absolute(link, base) {
  try {
    return new URL(link, base).href;
  } catch {
    return '';
  }
}

function urlOfEntry(entry, base) {
  const link = entry.webpage_url || entry.url;
  if (link) return absolute(link, base);
  if (!entry.id) return '';
  if (YOUTUBE_HOST.test(new URL(base).hostname)) return `https://www.youtube.com/watch?v=${entry.id}`;
  return String(entry.id);
}

function dateOf(entry) {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(String(entry.upload_date ?? ''));
  if (compact) return compact.slice(1).join('-');
  if (!Number.isFinite(entry.timestamp)) return '';
  return new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
}

function durationOf(entry) {
  return Number.isFinite(entry.duration) ? formatDuration(entry.duration) : '';
}

function viewsOf(entry) {
  return Number.isFinite(entry.view_count) ? `${entry.view_count} views` : '';
}

export function entryLine(entry, base) {
  return [urlOfEntry(entry, base), entry.title, dateOf(entry), durationOf(entry), viewsOf(entry)].filter(Boolean).join(' | ');
}

function summaryLine(count, root) {
  const title = root.title || root.uploader || root.channel;
  return `${count} ${count === 1 ? 'entry' : 'entries'}${title ? ` from ${title}` : ''}`;
}

function listArgs({ url, limit }) {
  return ['--flat-playlist', '--dump-single-json', '--playlist-end', String(limit), '--no-warnings', '--', url];
}

function parsed(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function listProfile(options) {
  if (!(await ytDlpAvailable(options.ytDlpMs))) return { failure: `${options.url}: missing tool: ${MISSING}` };
  const run = await runYtDlpWithRuntime(listArgs(options), options.ytDlpMs);
  if (run.error) return { failure: `${options.url}: list failed: ${ytDlpReason(run, options)}` };
  const root = parsed(run.stdout);
  if (!root) return { failure: `${options.url}: list failed: yt-dlp printed no listing` };
  const entries = flattened(root.entries).slice(0, options.limit);
  if (entries.length === 0) return { failure: `${options.url}: no entries: yt-dlp lists no videos for it` };
  return { lines: [...entries.map((entry) => entryLine(entry, options.url)), summaryLine(entries.length, root)] };
}
