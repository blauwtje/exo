// Waits, inside node, until every named build-task report exists, is non-empty
// and is no older than the dispatch start, so a run-unit whose Agent call came
// back backgrounded needs no `sleep` command, which the harness blocks. A stale
// report from an earlier run never counts.
//
// Usage: wait-report.mjs --since <epoch seconds> --report <path> [--report <path>...] [--timeout <seconds>]
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

export async function waitForReports({ reports, sinceSeconds, timeoutSeconds }) {
  const sinceMs = sinceSeconds * 1000;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let pending = reports.filter((reportPath) => !isFresh(reportPath, sinceMs));
  while (pending.length > 0 && Date.now() < deadline) {
    await delay(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    pending = pending.filter((reportPath) => !isFresh(reportPath, sinceMs));
  }
  return pending;
}

async function main(argv) {
  const flags = parseFlags(argv, { since: 'value', report: 'list', timeout: 'value' });
  if (!/^\d+$/.test(flags.since ?? '')) throw new UsageError("flag '--since' needs epoch seconds");
  if (flags.report === undefined) throw new UsageError("flag '--report' names a report path");
  const timeoutText = flags.timeout ?? String(DEFAULT_TIMEOUT_SECONDS);
  if (!/^\d+$/.test(timeoutText)) throw new UsageError("flag '--timeout' needs seconds");
  const pending = await waitForReports({
    reports: flags.report,
    sinceSeconds: Number(flags.since),
    timeoutSeconds: Number(timeoutText),
  });
  if (pending.length > 0) {
    process.stdout.write(`waiting ${pending.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${flags.report.join('\n')}\n`);
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
