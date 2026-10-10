// Waits, inside node, until every named build-task report exists, is non-empty
// and is no older than the dispatch start, so a run-unit whose Agent call came
// back backgrounded needs no `sleep` command, which the harness blocks. A stale
// report from an earlier run never counts.
//
// Usage: wait-report.mjs --since <epoch seconds> [--since ...] --report <path> [--report <path>...] [--any] [--timeout <seconds>]
// --since is given once for all reports or once per --report, paired in order;
// --any returns as soon as one report is fresh and prints only the fresh paths.
// Exit 0 prints each report path; exit 2 prints `waiting <paths>` at the
// deadline; exit 1 is a bad argument.

import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseFlags, UsageError, isMain } from '#script-flags';

const DEFAULT_TIMEOUT_SECONDS = 540;
const POLL_INTERVAL_MS = 5000;

function isFresh(reportPath, sinceMs) {
  if (!fs.existsSync(reportPath)) return false;
  const stats = fs.statSync(reportPath);
  return stats.size > 0 && stats.mtimeMs >= sinceMs;
}

// `sinceSeconds` is one number for all reports or an array paired in order with
// `reports`. Returns the reports still pending: all of them must be fresh, or
// with `any` one is enough, so the caller reads the fresh ones as the rest.
export async function waitForReports({ reports, sinceSeconds, timeoutSeconds, any = false }) {
  const sinceMs = reports.map((_, index) => 1000 * (Array.isArray(sinceSeconds) ? sinceSeconds[index] : sinceSeconds));
  const pendingNow = () => reports.filter((reportPath, index) => !isFresh(reportPath, sinceMs[index]));
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
  const flags = parseFlags(argv, { since: 'list', report: 'list', timeout: 'value', any: 'boolean' });
  if (flags.since === undefined || !flags.since.every((text) => /^\d+$/.test(text))) {
    throw new UsageError("flag '--since' needs epoch seconds");
  }
  if (flags.report === undefined) throw new UsageError("flag '--report' names a report path");
  if (flags.since.length !== 1 && flags.since.length !== flags.report.length) {
    throw new UsageError("flag '--since' is given once or once per '--report'");
  }
  const timeoutText = flags.timeout ?? String(DEFAULT_TIMEOUT_SECONDS);
  if (!/^\d+$/.test(timeoutText)) throw new UsageError("flag '--timeout' needs seconds");
  const sinceSeconds = flags.since.map(Number);
  const pending = await waitForReports({
    reports: flags.report,
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
    process.stderr.write(`wait-report: ${error.message}\n`);
    process.exitCode = 1;
  }
}
