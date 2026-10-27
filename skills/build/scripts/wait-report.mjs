import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseFlags, UsageError, isMain } from '#script-flags';

const DEFAULT_TIMEOUT_SECONDS = 540;
const POLL_INTERVAL_MS = 5000;
const USAGE = [
  'usage: wait-report.mjs --since <epoch seconds> [--since ...] --report <path> [--stamp <path>] [--report <path> [--stamp <path>]...] [--any] [--timeout <seconds>]',
  '--since is given once for all reports or once per --report, paired in order;',
  '--stamp is given once per --report or never: a report counts once its stamp is fresh too, or when it reports anything but GREEN;',
  '--any returns as soon as one report is fresh and prints only the fresh paths.',
  'Exit 0 prints each report path; exit 2 prints `waiting <paths>` at the deadline; exit 1 is a bad argument, also a --since later than now.',
].join('\n');

function isFresh(reportPath, sinceMs) {
  if (!fs.existsSync(reportPath)) return false;
  const stats = fs.statSync(reportPath);
  return stats.size > 0 && stats.mtimeMs >= sinceMs;
}

const BLOCKING_LINE = /^\s*(?:[-*]\s+)?(?:Task \d+:\s*)?(?:BLOCKED|PLAN DRIFT|FAIL)\b/;
const UNRESOLVED_LINE = /^\s*(?:[-*]\s+)?Unresolved:\s*(.*?)\s*$/;

function isGreen(reportPath) {
  const lines = fs.readFileSync(reportPath, 'utf8').split('\n');
  const open = lines.some((line) => BLOCKING_LINE.test(line) || !['', 'none'].includes(line.match(UNRESOLVED_LINE)?.[1].toLowerCase() ?? ''));
  return !open;
}

function isDone(reportPath, stampPath, sinceMs) {
  if (!isFresh(reportPath, sinceMs)) return false;
  if (stampPath === undefined || isFresh(stampPath, sinceMs)) return true;
  return !isGreen(reportPath);
}

export async function waitForReports({ reports, stamps = [], sinceSeconds, timeoutSeconds, any = false }) {
  const sinceMs = reports.map((_, index) => 1000 * (Array.isArray(sinceSeconds) ? sinceSeconds[index] : sinceSeconds));
  const pendingNow = () => reports.filter((reportPath, index) => !isDone(reportPath, stamps[index], sinceMs[index]));
  const deadline = Date.now() + timeoutSeconds * 1000;
  const done = (pending) => (any ? pending.length < reports.length : pending.length === 0);
  let pending = pendingNow();
  while (!done(pending) && Date.now() < deadline) {
    await delay(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    pending = pendingNow();
  }
  return pending;
}

async function main(argv) {
  const flags = parseFlags(argv, { since: 'list', report: 'list', stamp: 'list', timeout: 'value', any: 'boolean' }, { usage: USAGE });
  if (flags.since === undefined || !flags.since.every((text) => /^\d+$/.test(text))) {
    throw new UsageError("flag '--since' needs epoch seconds");
  }
  if (flags.report === undefined) throw new UsageError("flag '--report' names a report path");
  if (flags.since.length !== 1 && flags.since.length !== flags.report.length) {
    throw new UsageError("flag '--since' is given once or once per '--report'");
  }
  if (flags.stamp !== undefined && flags.stamp.length !== flags.report.length) {
    throw new UsageError("flag '--stamp' is given once per '--report' or not at all");
  }
  const timeoutText = flags.timeout ?? String(DEFAULT_TIMEOUT_SECONDS);
  if (!/^\d+$/.test(timeoutText)) throw new UsageError("flag '--timeout' needs seconds");
  const sinceSeconds = flags.since.map(Number);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const late = sinceSeconds.find((seconds) => seconds > nowSeconds);
  if (late !== undefined) {
    throw new UsageError(`flag --since ${late} is later than now ${nowSeconds}, so no report can count as fresh; pass the printed Since: or Wait: value, else \`date +%s\` taken before the dispatch`);
  }
  const pending = await waitForReports({
    reports: flags.report,
    stamps: flags.stamp ?? [],
    sinceSeconds: sinceSeconds.length === 1 ? sinceSeconds[0] : sinceSeconds,
    timeoutSeconds: Number(timeoutText),
    any: flags.any === true,
  });
  const fresh = flags.report.filter((reportPath) => !pending.includes(reportPath));
  if (flags.any ? fresh.length === 0 : pending.length > 0) {
    process.stdout.write(`waiting ${pending.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${fresh.join('\n')}\n`);
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`ERROR wait-report: ${error.message}\n`);
    process.exitCode = 1;
  }
}
